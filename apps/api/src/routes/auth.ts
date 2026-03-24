import type { FastifyPluginAsync } from 'fastify';
import { encrypt, randomBase64Url, sha256Hex } from '../lib/crypto.js';
import { signToken } from '../lib/jwt.js';
import { exchangeCode, getAuthUser } from '../services/github.js';

const plugin: FastifyPluginAsync = async (app) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  app.get('/auth/github', async (_req, reply) => {
    const state = randomBase64Url(24);
    reply.setCookie('dc_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60
    });

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID || '');
    url.searchParams.set('redirect_uri', process.env.GITHUB_CALLBACK_URL || '');
    url.searchParams.set('scope', 'read:user user:email repo');
    url.searchParams.set('state', state);
    reply.redirect(url.toString());
  });

  app.get('/auth/github/callback', async (req, reply) => {
    const code = (req.query as any)?.code as string | undefined;
    const state = (req.query as any)?.state as string | undefined;
    const cookieState = (req.cookies as any)?.dc_oauth_state as string | undefined;

    reply.clearCookie('dc_oauth_state', { path: '/' });

    if (!code) return reply.redirect(`${frontendUrl}/signin?error=no_code`);
    if (!state || !cookieState || state !== cookieState) return reply.redirect(`${frontendUrl}/signin?error=bad_state`);

    const accessToken = await exchangeCode(code);
    const ghUser = await getAuthUser(accessToken);

    const githubId = String(ghUser.id);
    const githubUsername = ghUser.login;

    const baseHandle = githubUsername.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
    let handle = baseHandle;
    for (let i = 0; i < 30; i++) {
      const existing = await app.prisma.user.findUnique({ where: { handle } });
      if (!existing) break;
      handle = `${baseHandle}${i + 1}`;
    }

    const existingByGithub = await app.prisma.user.findUnique({ where: { githubId } });
    const user =
      existingByGithub ??
      (await app.prisma.user.create({
        data: {
          githubId,
          githubUsername,
          handle,
          displayNameEnc: encrypt(ghUser.name || githubUsername),
          avatarUrl: ghUser.avatar_url,
          githubTokenEnc: encrypt(accessToken),
          bioEnc: ghUser.bio ? encrypt(ghUser.bio) : null,
          status: 'online'
        }
      }));

    if (existingByGithub) {
      await app.prisma.user.update({
        where: { id: user.id },
        data: {
          githubTokenEnc: encrypt(accessToken),
          status: 'online'
        }
      });
    }

    const membershipCount = await app.prisma.workspaceMember.count({ where: { userId: user.id } });
    if (membershipCount === 0) {
      const wsName = `${githubUsername}'s Workspace`;
      const base = githubUsername.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workspace';
      const slug = `${base}-${Math.random().toString(16).slice(2, 8)}`;
      const ws = await app.prisma.workspace.create({
        data: {
          nameEnc: encrypt(wsName),
          slug,
          ownerId: user.id
        }
      });
      await app.prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'owner' } });
      await app.prisma.channel.createMany({
        data: [
          { workspaceId: ws.id, name: 'general', description: 'General', type: 'public', createdBy: user.id },
          { workspaceId: ws.id, name: 'github-feed', description: 'GitHub activity', type: 'public', createdBy: user.id },
          { workspaceId: ws.id, name: 'ai-help', description: 'AI help', type: 'public', createdBy: user.id }
        ],
        skipDuplicates: true
      });
    }

    const access = signToken({ sub: user.id, typ: 'access' }, 24 * 60 * 60);
    const refresh = signToken({ sub: user.id, typ: 'refresh' }, 7 * 24 * 60 * 60);

    await app.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(access),
        refreshHash: sha256Hex(refresh),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    const q = new URLSearchParams({ token: access, refresh });
    reply.redirect(`${frontendUrl}/auth/callback?${q.toString()}`);
  });

  app.post('/auth/logout', { preHandler: app.requireAuth }, async (req, reply) => {
    const header = req.headers.authorization as string;
    const token = header.slice(7);
    const tokenHash = sha256Hex(token);

    await app.prisma.userSession.deleteMany({ where: { tokenHash } });
    await app.redis.del(`sess:${tokenHash}`);
    reply.send({ ok: true });
  });
};

export default plugin;
