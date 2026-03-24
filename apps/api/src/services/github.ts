import crypto from 'node:crypto';
import { timingSafeEqual } from '../lib/crypto';

type GitHubTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
};

export async function exchangeCode(code: string) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_CALLBACK_URL
    })
  });
  const data = (await res.json()) as GitHubTokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub OAuth failed');
  }
  return data.access_token;
}

export async function getAuthUser(token: string) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DevCollab-Hub'
    }
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return (await res.json()) as GitHubUser;
}

export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return timingSafeEqual(signatureHeader, expected);
}

