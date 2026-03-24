import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required');
  const redis = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });

  app.decorate('redis', redis);

  app.addHook('onClose', async (server) => {
    await server.redis.quit();
  });
};

export default fp(plugin, { name: 'redis' });
