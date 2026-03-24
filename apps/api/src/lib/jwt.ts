import jwt from 'jsonwebtoken';
import { z } from 'zod';

const payloadSchema = z.object({
  sub: z.string().uuid(),
  typ: z.enum(['access', 'refresh']),
  wid: z.string().uuid().optional()
});

export type JwtPayload = z.infer<typeof payloadSchema>;

export function signToken(payload: JwtPayload, ttlSeconds: number) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET too short or missing');
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds, algorithm: 'HS256' });
}

export function verifyToken(token: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET too short or missing');
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) throw new Error('Invalid token payload');
  return parsed.data;
}

