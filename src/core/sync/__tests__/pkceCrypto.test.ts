import { createClient } from '@supabase/supabase-js';

import { installPkceCrypto } from '../pkceCrypto';

// The native module does not exist under Jest: Node stands in for it, with the same results.
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, data: Uint8Array) => {
    const bytes = jest.requireActual('node:crypto').createHash('sha256').update(data).digest();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  },
  getRandomValues: (array: Uint8Array) => jest.requireActual('node:crypto').randomFillSync(array),
}));

const hex = (buffer: ArrayBuffer) => Buffer.from(buffer).toString('hex');
const sha256OfAbc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('installPkceCrypto', () => {
  it('gives a runtime without WebCrypto a SHA-256 digest', async () => {
    const scope: { crypto?: { subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } } } = {};

    installPkceCrypto(scope);

    expect(hex(await scope.crypto!.subtle.digest('SHA-256', new TextEncoder().encode('abc')))).toBe(sha256OfAbc);
  });

  it('accepts the algorithm as an object, the way WebCrypto does', async () => {
    const scope: { crypto?: { subtle: { digest(algorithm: { name: string }, data: Uint8Array): Promise<ArrayBuffer> } } } = {};

    installPkceCrypto(scope);

    expect(hex(await scope.crypto!.subtle.digest({ name: 'sha-256' }, new TextEncoder().encode('abc')))).toBe(sha256OfAbc);
  });

  it('rejects an algorithm it cannot compute instead of answering with another one', async () => {
    const scope: { crypto?: { subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } } } = {};

    installPkceCrypto(scope);

    await expect(scope.crypto!.subtle.digest('MD5', new Uint8Array())).rejects.toThrow('MD5');
  });

  it('fills random values from the native module, so the verifier never comes from Math.random', () => {
    const scope: { crypto?: { getRandomValues(array: Uint8Array): Uint8Array } } = {};

    installPkceCrypto(scope);

    const bytes = new Uint8Array(32);
    expect(scope.crypto!.getRandomValues(bytes)).toBe(bytes);
    expect(bytes.some((byte) => byte !== 0)).toBe(true);
  });

  it('keeps the digest and the random values a runtime already has', () => {
    const subtle = { digest: jest.fn() };
    const getRandomValues = jest.fn();
    const scope = { crypto: { subtle, getRandomValues } };

    installPkceCrypto(scope);

    expect(scope.crypto.subtle).toBe(subtle);
    expect(scope.crypto.getRandomValues).toBe(getRandomValues);
  });
});

describe('the code challenge method auth-js picks', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  // Hermes has no WebCrypto at all: Node's own would hide the difference.
  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    jest.restoreAllMocks();
  });

  async function authorizeUrl() {
    const store = new Map<string, string>();
    const client = createClient('https://api.example.test', 'anon', {
      auth: {
        flowType: 'pkce',
        persistSession: false,
        storage: {
          getItem: async (key) => store.get(key) ?? null,
          setItem: async (key, value) => void store.set(key, value),
          removeItem: async (key) => void store.delete(key),
        },
      },
    });
    const { data } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'trailskill://auth-callback', skipBrowserRedirect: true },
    });
    return new URL(data.url ?? '');
  }

  it('is plain without the install, which is why the install exists', async () => {
    expect((await authorizeUrl()).searchParams.get('code_challenge_method')).toBe('plain');
  });

  it('is s256 once the install ran', async () => {
    installPkceCrypto();

    const url = await authorizeUrl();

    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    // A hashed challenge is not the verifier it comes from: 43 base64url characters for 32 bytes.
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
