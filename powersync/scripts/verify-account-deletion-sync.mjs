// Behavior check of the sync and the writes of an account marked for deletion (#1244) against a REAL PowerSync. Synthetic data
// only; CI does not run it. Same pattern as verify-ended-link-streams.mjs (#1260/#1283).
//
// Why: the jest test accountDeletionSyncStreams.test.ts only reads the text of powersync/sync-config.yaml, and PowerSync 1.21
// builds the buckets of a query from separate lookups, so only a real service shows what a marked account receives. This script
// loads a small fixture into a THROWAWAY local stack and checks, through the real functions of the Edge Function, the real
// sign-in, the real PowerSync and the real PostgREST:
//   1. an open account receives its swimmer, the links and its own times (and the public texts);
//   2. after request -> confirm (the account is marked) it receives NOTHING, and its writes are refused;
//   3. a guardian who co-administers the same swimmer keeps receiving and keeps writing;
//   4. after cancel the marked account receives its rows again and writes again.
// The refusal of the writes of a marked account is also covered, table by table, by the database test
// supabase/tests/database/accounts/account_deletion_request.test.sql ("a marked account cannot write a row", "nor through a function the
// app calls", "the co-guardian keeps writing", "after cancel the account writes again").
//
// How to run (docs/local-development.md, "Everything local", on a stack that holds no real data: setup refuses to load into a
// database that already has athletes):
//   1. supabase start, then PowerSync from deploy/compose.yaml (the config under test is powersync/sync-config.yaml).
//   2. eval "$(supabase status -o env)" and export:
//        SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
//        POWERSYNC_URL=http://127.0.0.1:8080 DB_CONTAINER=supabase_db_<project_id>
//   3. node powersync/scripts/verify-account-deletion-sync.mjs setup   (once per database)
//      node powersync/scripts/verify-account-deletion-sync.mjs run     (exit 1 if a case is wrong; ends with the account open again)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (see the header of this file)`);
  return value;
};
const API = need("SUPABASE_URL");
const PS = need("POWERSYNC_URL");
const ANON = need("SUPABASE_ANON_KEY");
const SERVICE = need("SUPABASE_SERVICE_ROLE_KEY");
const DB_CONTAINER = need("DB_CONTAINER");
const TIMEOUT_MS = 30_000;

const uid = (name) => {
  const h = createHash("md5").update(`1244:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const email = (u) => `${u}@example.test`;
const passwordOf = (user) => createHash("sha256").update(`fixture:${uid(user)}`).digest("hex");
const users = ["marked", "coguard"]; // two guardians of the same swimmer W, who is in no school
const W = uid("W");

const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"], {
    input: sql,
    encoding: "utf8",
  });
const serviceHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };

async function setup() {
  if (Number(psql("select count(*) from public.athletes").trim()) > 0) {
    throw new Error("public.athletes is not empty: run this only on a throwaway local stack that holds no real data");
  }
  for (const u of users) {
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: serviceHeaders,
      body: JSON.stringify({ id: uid(u), email: email(u), password: passwordOf(u), email_confirm: true }),
    });
    if (!res.ok && res.status !== 422) throw new Error(`create ${u}: ${res.status} ${await res.text()}`);
  }
  psql(`
insert into public.athletes (id, first_name, last_name) values ('${W}', 'Swimmer', 'W');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('${uid("marked")}', '${W}', 'guardian'), ('${uid("coguard")}', '${W}', 'guardian');
insert into public.family_timing_measurements (owner_user_id, captured_by, athlete_id, stroke, distance, pool, session_type, captured_at, millis)
values ('${uid("marked")}', '${uid("marked")}', '${W}', 'FR', '50m', 'SCM', 'training', now(), 31500);
`);
  console.log("setup done");
}

async function token(user) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: email(user), password: passwordOf(user) }),
  });
  if (!res.ok) throw new Error(`sign in ${user}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// Rows per table that PowerSync sends to the user (a fresh connection, so the buckets are computed again).
async function syncOnce(user) {
  const jwt = await token(user);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const res = await fetch(`${PS}/sync/stream`, {
    method: "POST",
    signal: ctl.signal,
    headers: { Authorization: `Token ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({
      buckets: [], include_checksum: true, raw_data: true, client_id: `a-${user}-${Date.now()}`, parameters: {},
      streams: { include_defaults: true, subscriptions: [] },
    }),
  });
  if (!res.ok) throw new Error(`sync ${user}: ${res.status} ${await res.text()}`);
  const seen = new Map();
  let buffer = "";
  const decoder = new TextDecoder();
  try {
    outer: for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        for (const e of msg.data?.data ?? []) {
          if (!e.object_type) continue;
          const key = `${e.object_type}:${e.object_id}`;
          if (e.op === "PUT") seen.set(key, e.object_type);
          else if (e.op === "REMOVE") seen.delete(key);
        }
        if (msg.checkpoint_complete) break outer;
      }
    }
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
  const counts = {};
  for (const type of seen.values()) counts[type] = (counts[type] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// The replication of a change to account_sync_access reaches the buckets a moment later: ask again until the answer is the expected one.
async function syncUntil(user, expected) {
  let got;
  for (let i = 0; i < 20; i++) {
    got = await syncOnce(user);
    if (JSON.stringify(got) === JSON.stringify(expected)) return got;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return got;
}

// A write of the user's own profile through PostgREST with the user's token (the write guard raises 42501 for a marked account).
async function writeProfile(user) {
  const jwt = await token(user);
  const res = await fetch(`${API}/rest/v1/adult_profiles?on_conflict=user_id`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: uid(user), first_name: "Synthetic", last_name: user }),
  });
  return res.ok ? "ok" : res.status;
}

const rpc = async (fn, args) => {
  const res = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS), headers: serviceHeaders, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json();
};

let failures = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

async function run() {
  const texts = Number(psql("select count(*) from public.authorization_texts").trim());
  const markedOpen = { athlete_managers: 2, athletes: 1, authorization_texts: texts, family_timing_measurements: 1 };
  const coguardOpen = { athlete_managers: 2, athletes: 1, authorization_texts: texts };

  // A run that stopped half way leaves the account marked and the send counter used: start from open.
  await rpc("cancel_account_deletion", { p_user_id: uid("marked") });
  psql(`delete from public.account_deletion_code_sends where user_id = '${uid("marked")}'`);

  console.log("== marked: open account");
  check("sync", await syncUntil("marked", markedOpen), markedOpen);
  check("write of the own profile", await writeProfile("marked"), "ok");

  console.log("== marked: request -> confirm (the account is marked)");
  const code = (await rpc("request_account_deletion", { p_user_id: uid("marked") })).code;
  const answer = await rpc("confirm_account_deletion", { p_user_id: uid("marked"), p_code: code });
  check("confirm answers marked", answer.status, "marked");
  check("sync: nothing", await syncUntil("marked", {}), {});
  check("write of the own profile is refused", await writeProfile("marked"), 403);

  console.log("== coguard: guardian of the same swimmer, not marked");
  check("sync: keeps receiving the swimmer and the links", await syncUntil("coguard", coguardOpen), coguardOpen);
  check("write of the own profile", await writeProfile("coguard"), "ok");

  console.log("== marked: cancel");
  check("cancel answers cancelled", (await rpc("cancel_account_deletion", { p_user_id: uid("marked") })).status, "cancelled");
  check("sync: the rows come back", await syncUntil("marked", markedOpen), markedOpen);
  check("write of the own profile", await writeProfile("marked"), "ok");

  console.log(failures ? `${failures} FAILURES` : "ALL AS EXPECTED");
  process.exit(failures ? 1 : 0);
}

const command = process.argv[2];
if (command === "setup") await setup();
else if (command === "run") await run();
else {
  console.error("usage: verify-account-deletion-sync.mjs setup | run");
  process.exit(2);
}
