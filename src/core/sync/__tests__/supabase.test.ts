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
});
