import crypto from 'node:crypto';

let cachedKey: Buffer | null = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars');
  cachedKey = Buffer.from(k, 'hex');
  return cachedKey;
}

export function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(data: string) {
  const [ivHex, tagHex, encHex] = data.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

export function randomBase64Url(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

