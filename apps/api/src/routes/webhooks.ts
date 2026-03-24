import type { FastifyPluginAsync } from 'fastify';
import { verifyWebhookSignature } from '../services/github.js';
import { encrypt } from '../lib/crypto.js';

type GitHubWebhookEvent = {
  repository?: { id?: number; full_name?: string; html_url?: string };
  sender?: { login?: string; avatar_url?: string };
};

const plugin: FastifyPluginAsync = async (app) => {
  app.post(
    '/webhooks/github',
    { config: { rawBody: true } as any },
    async (req, reply) => {
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (!rawBody) return reply.code(400).send({ ok: false });
      if (!verifyWebhookSignature(rawBody, sig)) return reply.code(401).send({ ok: false });

      let payload: GitHubWebhookEvent;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as GitHubWebhookEvent;
      } catch {
        return reply.code(400).send({ ok: false });
      }

      const event = req.headers['x-github-event'] as string | undefined;
      const repo = payload.repository?.full_name || '';
      const repoUrl = payload.repository?.html_url || '';
      const sender = payload.sender?.login || '';
      const senderAvatar = payload.sender?.avatar_url || '';

      app.log.info({ event, repo, sender }, 'github webhook');

      const repoId = String(payload.repository?.id || '');
      const linked = repoId ? await app.prisma.linkedRepo.findFirst({ where: { githubRepoId: repoId } }) : null;
      if (linked) {
        const feed = await app.prisma.channel.findFirst({ where: { workspaceId: linked.workspaceId, name: 'github-feed', archived: false } });
        if (feed) {
          const content = `GitHub: ${event || 'event'} • ${repo} • ${sender}`.trim();
          const msg = await app.prisma.message.create({
            data: {
              channelId: feed.id,
              userId: null,
              contentEnc: encrypt(content),
              type: 'github_event',
              metadataEnc: encrypt(JSON.stringify({ event, repo, repoUrl, sender, senderAvatar }))
            }
          });
          const out = {
            id: msg.id,
            channelId: msg.channelId,
            userId: null,
            content,
            type: msg.type,
            createdAt: msg.createdAt,
            user: null,
            github: { event, repo, repoUrl, sender, senderAvatar }
          };
          app.io?.to(`ch:${feed.id}`).emit('msg:new', out);
          app.io?.to(`ws:${linked.workspaceId}`).emit('github:event', { event, repo, repoUrl, sender, senderAvatar });
        }
      }

      return reply.send({ ok: true });
    }
  );
};

export default plugin;
