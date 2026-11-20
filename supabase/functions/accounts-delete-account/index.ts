// Deno entry point of the accounts-delete-account function: wires the service to Supabase. All logic lives in the modules it imports.
// The user comes only from the verified JWT; the database functions are then called as service role for that user.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createAccountDeletionStore } from './adapters.ts';
import { createHandler } from './handler.ts';
import { selectMailer } from './mailer.ts';
import { createAccountDeletion } from './service.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The runtime may verify the JWT first (verify_jwt in config.toml locally, VERIFY_JWT in the stack); either way this asks the
// auth server who the token belongs to, and a missing or invalid token gets null.
const authenticate = async (request: Request) => {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : (data.user?.id ?? null);
};

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const store = createAccountDeletionStore(async (fn, args) => admin.rpc(fn, args));
const mailer = selectMailer({ RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'), RESEND_FROM: Deno.env.get('RESEND_FROM') }, fetch, 'accounts-delete-account');

Deno.serve(createHandler({ authenticate, service: createAccountDeletion({ store, mailer }) }));
