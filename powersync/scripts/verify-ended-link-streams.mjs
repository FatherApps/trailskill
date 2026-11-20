// Behavior check of the staff sync streams against a REAL PowerSync (#1260). Synthetic data only; CI does not run it.
//
// Why: the jest tests of the streams read the text of powersync/sync-config.yaml. PowerSync 1.21 builds the buckets of a
// join from separate lookups and combines their values as a cross product, so only a real service shows which rows a
// user receives. This script loads a small fixture (schools A and B, swimmer X ended in A and active in B, swimmer Y
// only in A, and nine users) into a THROWAWAY local stack, signs each user in, syncs through PowerSync with their own
// token and compares the rows each one receives with the expected set.
//
// How to run (docs/local-development.md, "Everything local", on a stack that holds no real data: the script refuses to
// load into a database that already has athletes):
//   1. supabase start, then PowerSync from deploy/compose.yaml (the config under test is powersync/sync-config.yaml).
//   2. eval "$(supabase status -o env)" and export:
//        SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
//        POWERSYNC_URL=http://127.0.0.1:8080 DB_CONTAINER=supabase_db_<project_id>
//   3. node powersync/scripts/verify-ended-link-streams.mjs setup     (once per database)
//      node powersync/scripts/verify-ended-link-streams.mjs run [user ...]   (exit 1 if a user gets a wrong set)
// setup is not atomic (a failure half way leaves part of the fixture): on a stack where it failed, recreate the database
// (`supabase db reset` on the THROWAWAY stack) before running it again. DUMP=1 prints only what each user receives. After a change to a query, rebuild the PowerSync image and run again.
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
const PASSWORD = "synthetic-pass-1260";
const TIMEOUT_MS = 30_000;

const uid = (name) => {
  const h = createHash("md5").update(`1260:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const names = [
  "sA", "sB", "org", "adm2", "adm1a", "adm1b", "coach2", "coachg", "coach1a", "coachd", "coachdg", "guard", "X", "Y", "gA", "gB",
  "mXA", "mXB", "mYA", "cXA", "cXB", "cYA", "pA", "pB", "vA", "vB", "bA", "bB",
  "nXB", "asXA", "asXB", "asYA", "asGA", "asGB", "asSA", "asSB", "fXA", "fXB", "fYA",
];
const label = new Map(names.map((n) => [uid(n), n]));
const lab = (id) => (id == null ? "-" : (label.get(id) ?? id.slice(0, 8)));
const users = ["adm2", "adm1a", "adm1b", "coach2", "coachg", "coach1a", "coachd", "coachdg", "guard"];
const email = (u) => `${u}@example.test`;

const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: sql,
    encoding: "utf8",
  });

async function setup() {
  if (Number(psql("select count(*) from public.athletes").match(/\d+/)?.[0]) > 0) {
    throw new Error("public.athletes is not empty: run this only on a throwaway local stack that holds no real data");
  }
  for (const u of users) {
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ id: uid(u), email: email(u), password: PASSWORD, email_confirm: true }),
    });
    if (!res.ok && res.status !== 422) throw new Error(`create ${u}: ${res.status} ${await res.text()}`);
  }
  const u = uid;
  psql(`
insert into public.schools (id, name) values ('${u("sA")}', 'School A'), ('${u("sB")}', 'School B');
insert into public.school_memberships (school_id, user_id, role) values
  ('${u("sA")}', '${u("adm2")}', 'school_admin'), ('${u("sB")}', '${u("adm2")}', 'school_admin'),
  ('${u("sA")}', '${u("adm1a")}', 'school_admin'), ('${u("sB")}', '${u("adm1b")}', 'school_admin'),
  ('${u("sA")}', '${u("coach2")}', 'coach'), ('${u("sB")}', '${u("coach2")}', 'coach'),
  ('${u("sA")}', '${u("coachg")}', 'coach'), ('${u("sB")}', '${u("coachg")}', 'coach'),
  ('${u("sA")}', '${u("coach1a")}', 'coach'), ('${u("sA")}', '${u("coachd")}', 'coach'), ('${u("sA")}', '${u("coachdg")}', 'coach');
update public.school_memberships set deactivated_at = now() where user_id in ('${u("coachd")}', '${u("coachdg")}');
insert into public.athletes (id, first_name, last_name) values ('${u("X")}', 'Swimmer', 'X'), ('${u("Y")}', 'Swimmer', 'Y');
insert into public.athlete_schools (athlete_id, school_id) values ('${u("X")}', '${u("sA")}'), ('${u("X")}', '${u("sB")}'), ('${u("Y")}', '${u("sA")}');
insert into public.athlete_managers (user_id, athlete_id, relation) values ('${u("guard")}', '${u("X")}', 'guardian');
insert into public.training_groups (id, school_id, name) values ('${u("gA")}', '${u("sA")}', 'Group A'), ('${u("gB")}', '${u("sB")}', 'Group B');
insert into public.athlete_groups (athlete_id, group_id) values ('${u("X")}', '${u("gA")}'), ('${u("X")}', '${u("gB")}'), ('${u("Y")}', '${u("gA")}');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('${u("coach2")}', '${u("X")}', '${u("sA")}'), ('${u("coach2")}', '${u("X")}', '${u("sB")}'), ('${u("coach2")}', '${u("Y")}', '${u("sA")}'), ('${u("coach1a")}', '${u("X")}', '${u("sA")}'), ('${u("coachd")}', '${u("Y")}', '${u("sA")}');
insert into public.coach_group_assignments (coach_user_id, group_id) values ('${u("coachg")}', '${u("gA")}'), ('${u("coachg")}', '${u("gB")}'), ('${u("coachd")}', '${u("gA")}'), ('${u("coachdg")}', '${u("gA")}');
insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at) values
  ('${u("mXA")}', '${u("coach1a")}', '${u("sA")}', 'repetition', '${u("X")}', 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev', '2026-11-01 08:00:00+00'),
  ('${u("mXB")}', '${u("coach2")}', '${u("sB")}', 'repetition', '${u("X")}', 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev', '2026-11-01 09:00:00+00'),
  ('${u("mYA")}', '${u("coach1a")}', '${u("sA")}', 'repetition', '${u("Y")}', 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev', '2026-11-01 10:00:00+00');
insert into public.measurement_conflicts (id, measurement_id, base_version, current_values, incoming_values) values
  ('${u("cXA")}', '${u("mXA")}', 1, '{"hundredths": 3000, "version": 2}', '{"hundredths": 3050}'),
  ('${u("cXB")}', '${u("mXB")}', 1, '{"hundredths": 3000, "version": 2}', '{"hundredths": 3050}'),
  ('${u("cYA")}', '${u("mYA")}', 1, '{"hundredths": 3000, "version": 2}', '{"hundredths": 3050}');
insert into public.training_plans (id, created_by, school_id, name) values ('${u("pA")}', '${u("adm2")}', '${u("sA")}', 'Plan A'), ('${u("pB")}', '${u("adm2")}', '${u("sB")}', 'Plan B');
insert into public.training_plan_versions (id, created_by, plan_id, version) values ('${u("vA")}', '${u("adm2")}', '${u("pA")}', 1), ('${u("vB")}', '${u("adm2")}', '${u("pB")}', 1);
insert into public.training_plan_blocks (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('${u("bA")}', '${u("adm2")}', '${u("vA")}', 1, 4, '50m', 'FR', 'warm_up', 'completion'), ('${u("bB")}', '${u("adm2")}', '${u("vB")}', 1, 4, '50m', 'FR', 'warm_up', 'completion');
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, athlete_id, group_id) values
  ('${u("asXA")}', '${u("adm2")}', '${u("sA")}', '${u("pA")}', '${u("vA")}', '2026-11-10', 'athlete', '${u("X")}', null),
  ('${u("asXB")}', '${u("adm2")}', '${u("sB")}', '${u("pB")}', '${u("vB")}', '2026-11-10', 'athlete', '${u("X")}', null),
  ('${u("asYA")}', '${u("adm2")}', '${u("sA")}', '${u("pA")}', '${u("vA")}', '2026-11-10', 'athlete', '${u("Y")}', null),
  ('${u("asGA")}', '${u("adm2")}', '${u("sA")}', '${u("pA")}', '${u("vA")}', '2026-11-10', 'group', null, '${u("gA")}'),
  ('${u("asGB")}', '${u("adm2")}', '${u("sB")}', '${u("pB")}', '${u("vB")}', '2026-11-10', 'group', null, '${u("gB")}'),
  ('${u("asSA")}', '${u("adm2")}', '${u("sA")}', '${u("pA")}', '${u("vA")}', '2026-11-10', 'school', null, null),
  ('${u("asSB")}', '${u("adm2")}', '${u("sB")}', '${u("pB")}', '${u("vB")}', '2026-11-10', 'school', null, null);
insert into public.training_plan_fulfillments (id, created_by, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values
  ('${u("fXA")}', '${u("coach1a")}', 'dev', '${u("asSA")}', '${u("vA")}', '${u("bA")}', '${u("X")}', '2026-11-10 08:00:00+00'),
  ('${u("fXB")}', '${u("coach2")}', 'dev', '${u("asSB")}', '${u("vB")}', '${u("bB")}', '${u("X")}', '2026-11-10 08:01:00+00'),
  ('${u("fYA")}', '${u("coach1a")}', 'dev', '${u("asSA")}', '${u("vA")}', '${u("bA")}', '${u("Y")}', '2026-11-10 08:02:00+00');
`);
  // The notice takes its author from the signed-in user (a trigger), so it is written as the guardian.
  psql(`
begin;
select set_config('request.jwt.claims', json_build_object('sub', '${u("guard")}')::text, true);
insert into public.training_plan_notices (id, created_by, athlete_id, assignment_id, version_id, block_id, body) values
  ('${u("nXB")}', '${u("guard")}', '${u("X")}', '${u("asSB")}', '${u("vB")}', '${u("bB")}', 'synthetic note');
commit;
`);
  psql(`
-- The baja: X leaves school A (the guard blocks client roles only; this runs as postgres).
update public.athlete_schools set ended_at = now(), ended_by = '${u("adm2")}' where athlete_id = '${u("X")}' and school_id = '${u("sA")}' and ended_at is null;
`);
  console.log("setup done");
}

async function token(user) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: email(user), password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign in ${user}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const rowLabel = (type, id, d) => {
  switch (type) {
    case "athlete_schools":
      return `${lab(d.athlete_id)}/${lab(d.school_id)}`;
    case "athlete_groups":
      return `${lab(d.athlete_id)}/${lab(d.group_id)}`;
    case "coach_athlete_assignments":
      return `${lab(d.coach_user_id)}>${lab(d.athlete_id)}/${lab(d.school_id)}`;
    case "coach_group_assignments":
      return `${lab(d.coach_user_id)}>${lab(d.group_id)}`;
    case "record_conflicts":
      return lab(d.record_id);
    default:
      return lab(id);
  }
};
const SHOW = [
  "athletes", "athlete_schools", "athlete_groups", "measurements", "record_conflicts", "training_plan_assignments",
  "training_plan_fulfillments", "training_plan_notices", "coach_athlete_assignments", "coach_group_assignments",
];

async function sync(user) {
  const jwt = await token(user);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let complete = false;
  const res = await fetch(`${PS}/sync/stream`, {
    method: "POST",
    signal: ctl.signal,
    headers: { Authorization: `Token ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({
      buckets: [], include_checksum: true, raw_data: true, client_id: `h-${user}`, parameters: {},
      streams: { include_defaults: true, subscriptions: [] },
    }),
  });
  if (!res.ok) throw new Error(`sync ${user}: ${res.status} ${await res.text()}`);
  const rows = new Map(); // type -> Set(label)
  const seen = new Map(); // `${type}:${id}` -> op, so a later REMOVE or PUT keeps the last
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
      if (msg.data?.data) {
        for (const e of msg.data.data) {
          if (!e.object_type) continue;
          const d = typeof e.data === "string" ? JSON.parse(e.data) : (e.data ?? {});
          const key = `${e.object_type}:${e.object_id}`;
          if (e.op === "PUT") seen.set(key, rowLabel(e.object_type, e.object_id, d));
          else if (e.op === "REMOVE") seen.delete(key);
        }
      }
      if (msg.checkpoint_complete) {
        complete = true;
        ctl.abort();
        break outer;
      }
    }
  }
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  } finally {
    clearTimeout(timer);
  }
  // A stream cut by the timeout has no complete checkpoint: comparing it would pass an empty set by accident.
  if (!complete) throw new Error(`sync of ${user} did not reach a complete checkpoint in ${TIMEOUT_MS / 1000}s`);
  for (const [key, l] of seen) {
    const type = key.split(":")[0];
    if (!rows.has(type)) rows.set(type, new Set());
    rows.get(type).add(l);
  }
  return rows;
}


const EXPECT = {
  adm2: { athletes: "X Y", athlete_schools: "X/sB Y/sA", athlete_groups: "X/gB Y/gA", measurements: "mXB mYA", record_conflicts: "mXB mYA", training_plan_assignments: "asGA asGB asSA asSB asXB asYA", training_plan_fulfillments: "fXB fYA", coach_athlete_assignments: "coach2>X/sB coach2>Y/sA coachd>Y/sA", coach_group_assignments: "coachd>gA coachdg>gA coachg>gA coachg>gB" },
  adm1a: { athletes: "Y", athlete_schools: "Y/sA", athlete_groups: "Y/gA", measurements: "mYA", record_conflicts: "mYA", training_plan_assignments: "asGA asSA asYA", training_plan_fulfillments: "fYA", coach_athlete_assignments: "coach2>Y/sA coachd>Y/sA", coach_group_assignments: "coachd>gA coachdg>gA coachg>gA" },
  adm1b: { athletes: "X", athlete_schools: "X/sB", athlete_groups: "X/gB", measurements: "mXB", record_conflicts: "mXB", training_plan_assignments: "asGB asSB asXB", training_plan_fulfillments: "fXB", coach_athlete_assignments: "coach2>X/sB", coach_group_assignments: "coachg>gB" },
  coach2: { athletes: "X Y", athlete_schools: "X/sB Y/sA", athlete_groups: "X/gB Y/gA", measurements: "mXB mYA", record_conflicts: "", training_plan_assignments: "asGA asGB asSA asSB asXB asYA", training_plan_fulfillments: "fXB fYA", coach_athlete_assignments: "coach2>X/sB coach2>Y/sA", coach_group_assignments: "" },
  coachg: { athletes: "X Y", athlete_schools: "X/sB Y/sA", athlete_groups: "X/gB Y/gA", measurements: "mXB mYA", record_conflicts: "", training_plan_assignments: "asGA asGB asSA asSB asXB asYA", training_plan_fulfillments: "fXB fYA", coach_athlete_assignments: "", coach_group_assignments: "coachg>gA coachg>gB" },
  coach1a: { athletes: "", athlete_schools: "", athlete_groups: "", measurements: "", record_conflicts: "", training_plan_assignments: "asGA asSA", training_plan_fulfillments: "", coach_athlete_assignments: "", coach_group_assignments: "" },
  coachd: { athletes: "", athlete_schools: "", athlete_groups: "", measurements: "", record_conflicts: "", training_plan_assignments: "", training_plan_fulfillments: "", coach_athlete_assignments: "", coach_group_assignments: "" },
  coachdg: { athletes: "", athlete_schools: "", athlete_groups: "", measurements: "", record_conflicts: "", training_plan_assignments: "", training_plan_fulfillments: "", coach_athlete_assignments: "", coach_group_assignments: "" },
  guard: { athletes: "X", athlete_schools: "X/sA X/sB", athlete_groups: "X/gA X/gB", measurements: "", record_conflicts: "", training_plan_assignments: "asGA asGB asSA asSB asXA asXB", training_plan_fulfillments: "fXA fXB", training_plan_notices: "nXB", coach_athlete_assignments: "", coach_group_assignments: "" },
};
let failures = 0;
const WHO = {
  adm2: "admin of A and B",
  adm1a: "admin of A only",
  adm1b: "admin of B only",
  coach2: "coach assigned directly to X in A and B and to Y in A",
  coachg: "coach of group gA (school A) and gB (school B)",
  coach1a: "coach of A only, assigned directly to X (ended in A)",
  coachd: "deactivated coach of A (direct to Y and group gA)",
  coachdg: "deactivated coach of A, group gA only",
  guard: "guardian of X",
};

async function run(list) {
  const unknown = list.filter((user) => !EXPECT[user]);
  if (unknown.length) throw new Error(`Unknown user ${unknown.join(", ")}; choose from: ${users.join(", ")}`);
  for (const user of list) {
    const rows = await sync(user);
    console.log(`== ${user}: ${WHO[user]}`);
    for (const t of SHOW) {
      const got = [...(rows.get(t) ?? [])].sort().join(" ");
      if (process.env.DUMP) {
        console.log(`  ${t.padEnd(27)} ${got}`);
        continue;
      }
      const want = (EXPECT[user][t] ?? "").split(" ").filter(Boolean).sort().join(" ");
      if (got === want) console.log(`  ok   ${t.padEnd(27)} ${got || "(none)"}`);
      else {
        failures++;
        console.log(`  FAIL ${t.padEnd(27)} got [${got}] want [${want}]`);
      }
    }
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "setup") await setup();
else if (mode === "run") {
  await run(rest.length ? rest : users);
  console.log(failures ? `${failures} FAILURES` : "ALL AS EXPECTED");
  process.exitCode = failures ? 1 : 0;
} else console.log("usage: node powersync/scripts/verify-ended-link-streams.mjs setup | run [user ...]");
