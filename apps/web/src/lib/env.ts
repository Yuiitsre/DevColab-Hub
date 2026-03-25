import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().optional()
});

export function getPublicEnv(input: Record<string, unknown>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { apiUrl: 'https://devcolab-backend.onrender.com' };
  }
  return { apiUrl: parsed.data.NEXT_PUBLIC_API_URL || 'https://devcolab-backend.onrender.com' };
}
