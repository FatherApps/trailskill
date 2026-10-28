// The native modules do not exist under Jest: Node and a Map stand in with the same results.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, data: Uint8Array) => {
    const bytes = jest.requireActual('node:crypto').createHash('sha256').update(data).digest();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  },
  getRandomValues: (array: Uint8Array) => jest.requireActual('node:crypto').randomFillSync(array),
}));

describe('supabase client configuration', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = original;
    jest.restoreAllMocks();
  });

  const load = () => {
    let mod!: typeof import('../supabase');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous load
      mod = require('../supabase');
    });
    return mod;
  };

  it('does not throw without env vars and names both missing variables', () => {
    // Empty strings, not delete: the Expo babel preset can inline an ambient value for a deleted variable.
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';

    const { supabase, supabaseConfigError } = load();

    expect(supabase).toBeDefined();
    expect(supabaseConfigError).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(supabaseConfigError).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('names only the missing variable and never prints the other value', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'secret-key-value';

    const { supabaseConfigError } = load();

    expect(supabaseConfigError).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(supabaseConfigError).not.toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(supabaseConfigError).not.toContain('secret-key-value');
  });

  it('has no config error and logs nothing when both variables are set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://api.example.test';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    const { supabaseConfigError } = load();

    expect(supabaseConfigError).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('uses the PKCE flow, so a provider sign-in returns a code to trade and not the tokens', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://api.example.test';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    const { supabase } = load();

    // flowType is protected in supabase-js and has no getter.
    expect((supabase.auth as unknown as { flowType: string }).flowType).toBe('pkce');
  });

  it('asks the provider for an s256 challenge on a runtime without WebCrypto, as Hermes is', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://api.example.test';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      const { supabase } = load();

      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: { redirectTo: 'trailskill://auth-callback', skipBrowserRedirect: true },
      });

      expect(new URL(data.url ?? '').searchParams.get('code_challenge_method')).toBe('s256');
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });

  it('still verifies the emailed six-digit code with the PKCE flow', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://api.example.test';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const calls: { url: string; body: unknown }[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? 'null')) });
      return new Response(JSON.stringify({ message: 'stop here' }), { status: 400, headers: { 'content-type': 'application/json' } });
    });
    const { supabase } = load();

    await supabase.auth.verifyOtp({ email: 'ana@example.test', token: '123456', type: 'email' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/auth/v1/verify');
    expect(calls[0].body).toMatchObject({ email: 'ana@example.test', token: '123456', type: 'email' });
  });
});
