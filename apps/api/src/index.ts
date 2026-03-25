import 'dotenv/config';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { Server as IOServer } from 'socket.io';
import rawBody from 'fastify-raw-body';
import * as Sentry from '@sentry/node';

import { startOtel } from './otel.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhooks.js';
import { buildSchema } from './graphql/schema.js';
import { verifyToken } from './lib/jwt.js';

const port = Number(process.env.PORT || 4000);

// ✅ HARD FIX — no localhost fallback in prod
const frontendUrl =
  process.env.FRONTEND_URL || 'https://devcolab.dev';

await startOtel();

const app = Fastify({ logger: true });

// ✅ Sentry
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development'
  });
}

// Types
declare module 'fastify' {
  interface FastifyInstance {
    io?: IOServer;
  }
}

// Security
await app.register(helmet);
await app.register(cookie);

// ✅ CORS FIX (VERY IMPORTANT)
await app.register(cors, {
  origin: (origin, cb) => {
    // allow server-to-server / curl
    if (!origin) return cb(null, true);

    // exact frontend
    if (origin === frontendUrl) return cb(null, true);

    // allow Vercel previews
    if (origin.endsWith('.vercel.app')) return cb(null, true);

    return cb(new Error('CORS blocked'), false);
  },
  credentials: true
});

// Plugins
await app.register(prismaPlugin);
await app.register(redisPlugin);
await app.register(authPlugin);

// Raw body (for webhooks)
await app.register(rawBody as any, {
  field: 'rawBody',
  global: false,
  encoding: false,
  runFirst: true
});

// Routes
await app.register(authRoutes);
await app.register(webhookRoutes);

// Health
app.get('/health', async () => ({
  ok: true,
  service: 'api'
}));

// Error tracking
app.addHook('onError', async (_req, _reply, error) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
});

// GraphQL
await app.register(mercurius, {
  schema: buildSchema(),
  graphiql: process.env.NODE_ENV !== 'production',
  context: async (req) => {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      return { prisma: app.prisma, io: app.io, userId: undefined };
    }

    try {
      const token = header.slice(7);
      const payload = verifyToken(token);

      return {
        prisma: app.prisma,
        io: app.io,
        userId: payload.typ === 'access' ? payload.sub : undefined
      };
    } catch {
      return { prisma: app.prisma, io: app.io, userId: undefined };
    }
  }
});

// ✅ SOCKET FIX (IMPORTANT)
const io = new IOServer(app.server, {
  cors: {
    origin: [frontendUrl],
    credentials: true
  }
});

app.decorate('io', io);

// Auth middleware
io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth as any)?.token;

    if (!token) return next(new Error('Unauthorized'));

    const payload = verifyToken(token);

    if (payload.typ !== 'access') {
      return next(new Error('Unauthorized'));
    }

    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

// Socket events
io.on('connection', (socket) => {
  socket.emit('connected', { userId: socket.data.userId });

  socket.on('room:join', (roomId: string) => {
    if (typeof roomId !== 'string' || roomId.length > 128) return;
    socket.join(roomId);
  });

  socket.on('room:leave', (roomId: string) => {
    if (typeof roomId !== 'string' || roomId.length > 128) return;
    socket.leave(roomId);
  });

  socket.on('collab:presence', (payload: { roomId: string; status: string }) => {
    if (!payload?.roomId) return;

    socket.to(payload.roomId).emit('collab:presence', {
      userId: socket.data.userId,
      status: payload.status
    });
  });
});

// Start server
await app.listen({
  port,
  host: '0.0.0.0'
});
