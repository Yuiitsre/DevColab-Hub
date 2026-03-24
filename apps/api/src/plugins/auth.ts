import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { verifyToken } from '../lib/jwt';
import { sha256Hex } from '../lib/crypto';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
  interface FastifyInstance {
    requireAuth: (req: unknown, reply: unknown) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorate('requireAuth', async (req: any, reply: any) => {
    const header = req.headers?.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing token' });
      return;
    }
    const token = header.slice(7);
    const payload = verifyToken(token);
    if (payload.typ !== 'access') {
      reply.code(401).send({ error: 'Invalid token type' });
      return;
    }

    const tokenHash = sha256Hex(token);
    const cacheKey = `sess:${tokenHash}`;
    const cached = await app.redis.get(cacheKey);
    if (!cached) {
      const session = await app.prisma.userSession.findUnique({ where: { tokenHash } });
      if (!session || session.expiresAt.getTime() < Date.now()) {
        reply.code(401).send({ error: 'Session expired' });
        return;
      }
      await app.redis.set(cacheKey, '1', 'EX', 60);
    }

    const user = await app.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      reply.code(401).send({ error: 'User not found' });
      return;
    }
    req.userId = user.id;
  });
};

export default fp(plugin, { name: 'auth' });

