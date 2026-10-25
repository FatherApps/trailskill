-- Demo data for development and walkthroughs (issue #226). Synthetic only: no
-- real people, schools, organizations or identification numbers.
--
-- Idempotent: every row has a fixed id (or a deterministic one) and every
-- insert is "on conflict do nothing", so applying it again, or on a database
-- that holds an older version of this seed, adds only what is missing and
-- changes nothing else. Kept apart from the migrations on purpose.
--
-- Accounts (sign in with the email code; there is no password):
--   demo-coach@example.test     coach of Group A
--   demo-guardian@example.test  guardian of two athletes of Group A
--   demo-admin@example.test     school administrator
--
-- To remove it, see supabase/scripts/seed-remove.sql.

-- Accounts. Created straight in auth so GoTrue accepts an email code sign-in
-- for them: the token columns are not null, so they are empty strings.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'demo-coach@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'demo-guardian@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'demo-admin@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '{"sub":"00000000-0000-4000-8000-000000000001","email":"demo-coach@example.test"}',
   'email', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   '{"sub":"00000000-0000-4000-8000-000000000002","email":"demo-guardian@example.test"}',
   'email', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
   '{"sub":"00000000-0000-4000-8000-000000000003","email":"demo-admin@example.test"}',
   'email', now(), now(), now())
on conflict do nothing;

-- Organizations: a league with three category templates, and the school's own
-- organization below it. Names are invented; none is a real federation category.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('00000000-0000-4000-8000-000000000101', 'league', null, null, 'Demo Swim League'),
  ('00000000-0000-4000-8000-000000000102', 'school', null, '00000000-0000-4000-8000-000000000101', 'Demo Swim School')
on conflict do nothing;

insert into public.category_templates (id, organization_id, name, sort_order) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 'Under 11', 1),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000101', 'Under 14', 2),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000101', 'Open', 3)
on conflict do nothing;

-- School, groups and staff. Inserting the school copies the league's templates
-- into its categories (random ids), so they are looked up by name below. The
-- organization is given so the school hangs from the league, whose category
-- templates it copies.
insert into public.schools (id, name, organization_id)
values ('00000000-0000-4000-8000-0000000000a1', 'Demo Swim School',
        '00000000-0000-4000-8000-000000000102')
on conflict do nothing;

insert into public.training_groups (id, school_id, name) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Group A'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'Group B')
on conflict do nothing;

insert into public.school_memberships (school_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'coach'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000003', 'school_admin')
on conflict do nothing;

-- The coach trains Group A only.
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1')
on conflict do nothing;

-- Athletes: invented names. Group A is c1, c2, c5, c6, c7; Group B is c3, c4,
-- c8, c9, ca. The queries below pick the demo athletes by the id range c1-ca,
-- never the ones people add.
insert into public.athletes (id, first_name, last_name) values
  ('00000000-0000-4000-8000-0000000000c1', 'Mateo', 'Varelo'),
  ('00000000-0000-4000-8000-0000000000c2', 'Sofia', 'Quendal'),
  ('00000000-0000-4000-8000-0000000000c3', 'Santiago', 'Moravel'),
  ('00000000-0000-4000-8000-0000000000c4', 'Valentina', 'Dorsal'),
  ('00000000-0000-4000-8000-0000000000c5', 'Samuel', 'Tolmar'),
  ('00000000-0000-4000-8000-0000000000c6', 'Isabella', 'Brenvo'),
  ('00000000-0000-4000-8000-0000000000c7', 'Emiliano', 'Corsel'),
  ('00000000-0000-4000-8000-0000000000c8', 'Luciana', 'Marvet'),
  ('00000000-0000-4000-8000-0000000000c9', 'Nicolas', 'Pelmar'),
  ('00000000-0000-4000-8000-0000000000ca', 'Camila', 'Ordelan')
on conflict do nothing;

-- Categories: c1-c4 Under 11, c5-c8 Under 14, c9 and ca Open. A school that
-- already existed without categories gets no category (left join).
insert into public.athlete_schools (athlete_id, school_id, category_id)
select a.id, '00000000-0000-4000-8000-0000000000a1', c.id
from public.athletes a
left join public.categories c
  on c.school_id = '00000000-0000-4000-8000-0000000000a1'
 and c.name = case when a.id::text ~ 'c[1-4]$' then 'Under 11'
                   when a.id::text ~ 'c[5-8]$' then 'Under 14'
                   else 'Open' end
where a.id::text ~ '^00000000-0000-4000-8000-0000000000c[1-9a]$'
on conflict do nothing;

-- c1, c2 in Group A and c3, c4 in Group B, as in the first version of this seed, so a database that has it converges.
insert into public.athlete_groups (athlete_id, group_id)
select id, case when id::text ~ '^00000000-0000-4000-8000-0000000000c[12567]$'
                then '00000000-0000-4000-8000-0000000000b1'::uuid
                else '00000000-0000-4000-8000-0000000000b2'::uuid end
from public.athletes
where id::text ~ '^00000000-0000-4000-8000-0000000000c[1-9a]$'
on conflict do nothing;

-- The guardian manages two athletes of Group A.
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c1', 'guardian'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c2', 'guardian')
on conflict do nothing;

-- One synthetic text per purpose. Placeholders only: the real, legally
-- reviewed texts are not part of the repository.
insert into public.authorization_texts (purpose, version, language, body) values
  ('record_times', 1, 'es-CO', 'SYNTHETIC PLACEHOLDER, not legal text: authorization to record times.'),
  ('import_official_results', 1, 'es-CO', 'SYNTHETIC PLACEHOLDER, not legal text: authorization to import official results.'),
  ('share_results_with_school', 1, 'es-CO', 'SYNTHETIC PLACEHOLDER, not legal text: authorization to share results with another school.')
on conflict do nothing;

-- Authorizations in force: the guardian accepted two purposes for both
-- athletes about two months ago, before the first recorded time. The text is
-- looked up, not assumed, so this also works when the texts already exist with other ids.
insert into public.authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at)
select v.id::uuid, '00000000-0000-4000-8000-000000000002', v.athlete_id::uuid, v.purpose, t.id,
       now() - interval '60 days'
from (values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'record_times'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 'import_official_results'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c2', 'record_times'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c2', 'import_official_results')
) as v(id, athlete_id, purpose)
join public.authorization_texts t
  on t.purpose = v.purpose and t.version = 1 and t.language = 'es-CO'
on conflict do nothing;

-- Times: six weekly training sessions per athlete in two events, entered by the
-- coach. Week 0 is the latest. Times improve with the weeks (25 hundredths per
-- week) plus a deterministic wobble, so some weeks are slower and each athlete
-- has a personal best. The ids are deterministic, so a second run inserts nothing.
insert into public.measurements (
  id, created_by, device_id, kind, athlete_id, hundredths, stroke, distance, pool,
  session_type, source, captured_at
)
select
  md5('demo-measurement:' || a.id || ':' || e.stroke || e.distance || ':' || w.week)::uuid,
  '00000000-0000-4000-8000-000000000001',
  'demo-device',
  'repetition',
  a.id,
  -- Base time by event, slower for later athletes, minus progress, plus 0-39.
  e.base + a.rank * 120 + w.week * 25
    + (abs(hashtextextended(a.id::text || e.stroke || w.week, 0)) % 40)::int,
  e.stroke,
  e.distance,
  'SCM',
  'training',
  'screen_stopwatch',
  date_trunc('day', now()) - make_interval(days => w.week * 7)
from (
  select id, row_number() over (order by id) as rank
  from public.athletes
  where id::text ~ '^00000000-0000-4000-8000-0000000000c[1-9a]$'
) a
cross join (values ('FR', '50m', 3000), ('BK', '100m', 7000)) as e(stroke, distance, base)
cross join generate_series(0, 5) as w(week)
on conflict do nothing;

-- A training plan of the school with one version of four blocks. There is no
-- plan assignment table yet: the school staff read the plan, nobody else.
insert into public.training_plans (id, created_by, school_id, name)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000a1', 'Demo weekly plan')
on conflict do nothing;

insert into public.training_plan_versions (id, created_by, plan_id, version)
values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000e1', 1)
on conflict do nothing;

insert into public.training_plan_blocks (
  id, created_by, version_id, position, repetitions, distance, stroke, drill,
  equipment, send_off_seconds, phase, recording
) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000e2', 1, 4, '100m', 'FR', null,
   '{}', null, 'warm_up', 'completion'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000e2', 2, 8, '50m', 'FR', null,
   '{}', 75, 'main', 'per_repetition'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000e2', 3, 4, '25m', null, 'Catch-up drill',
   '{fins,kickboard}', null, 'technique', 'completion'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000e2', 4, 1, '200m', 'FR', null,
   '{}', null, 'cool_down', 'completion')
on conflict do nothing;
