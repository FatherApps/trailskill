// Deno entry point of the school-console-invite-coach function: wires the service to Supabase. All logic lives in the modules it imports.
// It acts as the caller (their JWT), never with an elevated key, so the database policies decide who may invite.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createInvitationStore, type Db } from './adapters.ts';
import { createHandler } from './handler.ts';
import { createInviteCoach } from './service.ts';
import { createTestSender } from './testSender.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// The runtime may verify the JWT first (verify_jwt in config.toml locally, VERIFY_JWT in the stack); either way this asks the
// auth server who the token belongs to, and a missing or invalid token gets null.
const clientOf = (authorization: string) => createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });

const userDb = (client: ReturnType<typeof clientOf>): Db => ({
  insert: async (table, row) => {
    const { data, error } = await client.from(table).insert(row).select('id').single();
    return { data: data as Record<string, unknown> | null, error };
  },
  selectOne: async (table, match, columns) => {
    const { data, error } = await client.from(table).select(columns).match(match).maybeSingle();
    return { data: data as Record<string, unknown> | null, error };
  },
});

const authenticate = async (request: Request) => {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const { data, error } = await clientOf(authorization).auth.getUser();
  return error ? null : (data.user?.id ?? null);
};

// The real sending provider is an open maintainer decision (#63): until then the test sender delivers nothing.
const sender = createTestSender();

Deno.serve((request) => {
  const authorization = request.headers.get('Authorization');
  // Without a token the handler answers 401 before the store is used.
  const store = createInvitationStore(userDb(clientOf(authorization ?? '')));
  return createHandler({ authenticate, service: { inviteCoach: createInviteCoach({ store, sender }) } })(request);
});
