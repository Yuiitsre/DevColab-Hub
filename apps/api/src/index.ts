import 'dotenv/config';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { Server as IOServer } from 'socket.io';
import rawBody from 'fastify-raw-body';
import * as Sentry from '@sentry/node';
import { startOtel } from './otel';
import prismaPlugin from './plugins/prisma';
import redisPlugin from './plugins/redis';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import webhookRoutes from './routes/webhooks';
import { buildSchema } from './graphql/schema';
import { verifyToken } from './lib/jwt';

const port = Number(process.env.PORT || 4000);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

await startOtel();

const app = Fastify({ logger: true, trustProxy: true });

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development'
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    io?: IOServer;
  }
}

await app.register(helmet, { global: true });
await app.register(cookie);
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin === frontendUrl) return cb(null, true);
    if (origin.endsWith('.vercel.app')) return cb(null, true);
    return cb(new Error('CORS'), false);
  },
  credentials: true
});

await app.register(prismaPlugin);
await app.register(redisPlugin);
await app.register(authPlugin);
await app.register(rawBody as any, { field: 'rawBody', global: false, encoding: false, runFirst: true });

await app.register(authRoutes);
await app.register(webhookRoutes);

app.get('/health', async () => ({ ok: true, service: 'api', version: '3.0.0' }));

app.addHook('onError', async (_req, _reply, error) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(error);
});

await app.register(mercurius, {
  schema: buildSchema(),
  graphiql: process.env.NODE_ENV !== 'production',
  context: async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return { prisma: app.prisma, io: app.io, userId: undefined };
    try {
      const token = header.slice(7);
      const payload = verifyToken(token);
      return { prisma: app.prisma, io: app.io, userId: payload.typ === 'access' ? payload.sub : undefined };
    } catch {
      return { prisma: app.prisma, io: app.io, userId: undefined };
    }
  }
});

const io = new IOServer(app.server, {
  cors: {
    origin: [frontendUrl],
    credentials: true
  }
});

app.decorate('io', io);

io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth as any)?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    const payload = verifyToken(token);
    if (payload.typ !== 'access') return next(new Error('Unauthorized'));
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

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
    socket.to(payload.roomId).emit('collab:presence', { userId: socket.data.userId, status: payload.status });
  });
});

await app.listen({ port, host: '0.0.0.0' });
