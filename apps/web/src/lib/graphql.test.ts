import { gql } from './graphql';

describe('gql', () => {
  it('throws on http error', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(gql({ apiUrl: 'http://x', query: '{x}' })).rejects.toThrow('HTTP 500');
  });

  it('throws on graphql errors', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'bad' }] })
    }));
    await expect(gql({ apiUrl: 'http://x', query: '{x}' })).rejects.toThrow('bad');
  });

  it('returns data', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } })
    }));
    await expect(gql<{ ok: boolean }, undefined>({ apiUrl: 'http://x', query: '{x}' })).resolves.toEqual({ ok: true });
  });
});

