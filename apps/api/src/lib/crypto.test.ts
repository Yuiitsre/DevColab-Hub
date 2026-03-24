import { decrypt, encrypt, randomBase64Url, sha256Hex, timingSafeEqual } from './crypto';

describe('crypto', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('encrypts and decrypts', () => {
    const ct = encrypt('hello');
    expect(typeof ct).toBe('string');
    expect(decrypt(ct)).toBe('hello');
  });

  it('randomBase64Url returns url-safe string', () => {
    const s = randomBase64Url(16);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('sha256Hex returns 64 hex chars', () => {
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('timingSafeEqual handles different lengths', () => {
    expect(timingSafeEqual('a', 'bb')).toBe(false);
    expect(timingSafeEqual('same', 'same')).toBe(true);
  });
});

