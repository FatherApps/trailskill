// Deno entry point of the results-import function: wires the service to Supabase. All logic lives in the modules it imports.
// The service_role key is read from the runtime's own environment and never leaves this process.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createConfirmations, createIdentityNumbers, createOrganizationChain, createPendingStore, createQueryGate, type Db } from './adapters.ts';
import { createHandler } from './handler.ts';
import { createProviderRegistry } from './registry.ts';
import { createResultsImport } from './service.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRole = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const db: Db = {
  rpc: async (fn, args) => {
    const { data, error } = await serviceRole.rpc(fn, args);
    return { data, error };
  },
  select: async (table, columns) => {
    const { data, error } = await serviceRole.from(table).select(columns);
    return { data: data as Record<string, unknown>[] | null, error };
  },
  deleteById: async (table, id) => {
    const { error } = await serviceRole.from(table).delete().eq('id', id);
    return { error };
  },
};

// Adapters are added here as federations are supported: createProviderRegistry([...adapters]).
const service = createResultsImport({
  registry: createProviderRegistry([]),
  gate: createQueryGate(db),
  identityNumbers: createIdentityNumbers(db),
  confirmations: createConfirmations(db),
  organizationChain: createOrganizationChain(db),
  pending: createPendingStore(db),
});

// The platform verifies the JWT (verify_jwt in config.toml); this asks the auth server who it belongs to.
const authenticate = async (request: Request) => {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await user.auth.getUser();
  return error ? null : (data.user?.id ?? null);
};

Deno.serve(createHandler({ authenticate, service }));
