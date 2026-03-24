import { getPublicEnv } from './env';

describe('getPublicEnv', () => {
  it('returns default when missing', () => {
    expect(getPublicEnv({})).toEqual({ apiUrl: 'http://localhost:4000' });
  });

  it('returns default when invalid url', () => {
    expect(getPublicEnv({ NEXT_PUBLIC_API_URL: 'not-a-url' })).toEqual({ apiUrl: 'http://localhost:4000' });
  });

  it('returns provided url when valid', () => {
    expect(getPublicEnv({ NEXT_PUBLIC_API_URL: 'https://api.example.com' })).toEqual({ apiUrl: 'https://api.example.com' });
  });
});

