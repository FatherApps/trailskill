// Deno entry point of the accounts-deletion-worker function: wires the daily run (account deletions, emails, Storage drain) to Supabase. All logic lives in the modules it imports.
// pg_cron calls it through pg_net with no user token; the shared secret ACCOUNTS_WORKER_SECRET is what authenticates the call.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { selectMailer } from '../accounts-delete-account/mailer.ts';
import { createWorkerStore } from './adapters.ts';
import { createHandler } from './handler.ts';
import { createRunWorker } from './service.ts';
import { createStorageApi, createStorageDrainStore } from './storageAdapters.ts';
import { createStorageDrain, graceHoursFrom } from './storageDrain.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const store = createWorkerStore(async (fn, args) => admin.rpc(fn, args));
const mailer = selectMailer({ RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'), RESEND_FROM: Deno.env.get('RESEND_FROM') }, fetch, 'accounts-deletion-worker');
const clock = { now: () => new Date() };
// Objects are deleted through the Storage API only, never with SQL.
const drain = createStorageDrain({
  store: createStorageDrainStore(async (fn, args) => admin.rpc(fn, args)),
  storage: createStorageApi((bucket, paths) => admin.storage.from(bucket).remove(paths)),
  clock,
  graceHours: graceHoursFrom(Deno.env.get('STORAGE_ORPHAN_GRACE_HOURS')),
});
const run = createRunWorker({ store, mailer, clock, drain });

Deno.serve(createHandler({ secret: Deno.env.get('ACCOUNTS_WORKER_SECRET'), service: { run } }));
