import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().optional()
});

export function getEnv() {
  const parsed = schema.safeParse(process.env);

  // Debug only (won’t break app)
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
  }

  const apiUrl =
    parsed.data?.NEXT_PUBLIC_API_URL?.trim() ||
    'https://devcolab-backend.onrender.com';

  // Extra safety: ensure no trailing slash
  const normalizedApiUrl = apiUrl.replace(/\/+$/, '');

  return {
    apiUrl: normalizedApiUrl
  };
}
