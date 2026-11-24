// Deno entry point of the results-import function: wires the service to Supabase. All logic lives in the modules it imports.
// The service_role key is read from the runtime's own environment and never leaves this process.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createOfficialResultsActions } from './actions.ts';
import {
  createAccess,
  createConfirmationReader,
  createConfirmations,
  createIdentityNumbers,
  createImportRecorder,
  createOrganizationChain,
  createPendingStore,
  createQueryGate,
  createTournamentCatalog,
  type Db,
} from './adapters.ts';
import { createHandler } from './handler.ts';
import { createIsOperatorToken } from './operator.ts';
import { createCoColombiaacuatica } from './providers/co-colombiaacuatica/index.ts';
import { createCoFecna } from './providers/co-fecna/index.ts';
import { createProviderRegistry } from './registry.ts';
import { createResultsImport } from './service.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRole = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const db: Db = {
  rpc: async (fn, args) => {
    const { data, error } = await serviceRole.rpc(fn, args);
    return { data, error };
  },
  select: async (table, columns, equals = {}) => {
    const { data, error } = await Object.entries(equals).reduce((query, [column, value]) => query.eq(column, value), serviceRole.from(table).select(columns));
    return { data: data as Record<string, unknown>[] | null, error };
  },
  deleteById: async (table, id) => {
    const { error } = await serviceRole.from(table).delete().eq('id', id);
    return { error };
  },
};

// Federation adapters go in the first list, results-platform adapters in the second: createProviderRegistry([...adapters], [...platforms]).
const registry = createProviderRegistry([createCoFecna()], [createCoColombiaacuatica()]);
const identityNumbers = createIdentityNumbers(db);
const organizationChain = createOrganizationChain(db);
const pending = createPendingStore(db);
const service = createResultsImport({
  registry,
  gate: createQueryGate(db),
  identityNumbers,
  confirmations: createConfirmations(db),
  organizationChain,
  pending,
  tournaments: createTournamentCatalog(db),
});
const official = createOfficialResultsActions({
  service,
  identityNumbers,
  pending,
  recorder: createImportRecorder(db),
  access: createAccess(db),
  confirmations: createConfirmationReader(db),
  providerKeyFor: async (organizationId) => registry.resolve(await organizationChain(organizationId), organizationId)?.key ?? null,
});

// The runtime may verify the JWT first (verify_jwt in config.toml locally, VERIFY_JWT in the stack); either way this asks the
// auth server who the token belongs to, and a missing or invalid token gets null.
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

// Only `backfill_tournaments` asks for the operator: a caller whose bearer token is this function's own service role key (compared in constant time).
const isOperatorToken = createIsOperatorToken(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(createHandler({ authenticate, isOperatorToken, service, official }));
