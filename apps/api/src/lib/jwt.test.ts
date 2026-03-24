import { signToken, verifyToken } from './jwt';

describe('jwt', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'b'.repeat(64);
  });

  it('signs and verifies', () => {
    const t = signToken({ sub: '00000000-0000-0000-0000-000000000000', typ: 'access' }, 60);
    const p = verifyToken(t);
    expect(p.sub).toBe('00000000-0000-0000-0000-000000000000');
    expect(p.typ).toBe('access');
  });
});

