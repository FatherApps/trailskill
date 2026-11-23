-- The school's anonymous copy of a swimmer (issue #1420). create_anonymous_school_copy lets an active school_admin copy the marks the
-- school reads into an anonymous swimmer of the school, keyed by the recovery identity of #1416, which no client can read.
-- Users: admin SA of A (a1), admin SB of B (a2), coach K of A (a3), admin DA of A whose membership is deactivated (a4), guardian G of X (a5),
-- guardian P of P (a6), guardian Q of Q (a7).
-- Schools: A (b1), B (b2). Swimmers: X (e1, managed by G, active in A and B, has a recovery identity), Y (e2, active in A, no code),
-- Z (e3, link with A ended 10 days ago, has a code), W (e4, link with A ended 40 days ago), V (e5, only in B), P (e6, managed by a6, no code),
-- Q (e7, managed by a7, no code), R (e8, no marks, no code).
-- Marks of X in A: f1 (3100), f2 (split of f1, 1500), f3 (discarded), f4 (hidden); f5 is of X in B. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14200000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The anonymous swimmer made from a swimmer in school A, as the owner reads it (a client cannot read the table).
create function pg_temp.anon_of(src text) returns uuid language sql security definer as $$
  select athlete_id from public.athlete_anonymous_copies where source_athlete_id = pg_temp.u($1) and school_id = pg_temp.u('b1') $$;
create function pg_temp.identity_of(src text) returns uuid language sql security definer as $$
  select identity_id from public.athlete_anonymous_copies where source_athlete_id = pg_temp.u($1) and school_id = pg_temp.u('b1') $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'admin-sa@example.test'), (pg_temp.u('a2'), 'admin-sb@example.test'), (pg_temp.u('a3'), 'coach-k@example.test'),
  (pg_temp.u('a4'), 'admin-da@example.test'), (pg_temp.u('a5'), 'guardian-g@example.test'),
  (pg_temp.u('a6'), 'guardian-p@example.test'), (pg_temp.u('a7'), 'guardian-q@example.test');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Copy School A'), (pg_temp.u('b2'), 'Copy School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a2'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a3'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a4'), 'school_admin');
-- A deactivated admin cannot be built through the table check (only coaches are deactivated): lifted here, rolled back with the transaction.
alter table public.school_memberships drop constraint school_memberships_deactivated_coach_only;
update public.school_memberships set deactivated_at = now() where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a4');

insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Xavier', 'Origin'), (pg_temp.u('e2'), 'Yara', 'Nocode'), (pg_temp.u('e3'), 'Zoe', 'Ended'),
  (pg_temp.u('e4'), 'Wendy', 'Late'), (pg_temp.u('e5'), 'Vera', 'Other'), (pg_temp.u('e6'), 'Paula', 'Issues'),
  (pg_temp.u('e7'), 'Quino', 'Erased'), (pg_temp.u('e8'), 'Rosa', 'Deleted');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a5'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a6'), pg_temp.u('e6'), 'guardian'), (pg_temp.u('a7'), pg_temp.u('e7'), 'guardian');
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values
  (pg_temp.u('e1'), pg_temp.u('b1'), null, null), (pg_temp.u('e1'), pg_temp.u('b2'), null, null),
  (pg_temp.u('e2'), pg_temp.u('b1'), null, null),
  (pg_temp.u('e3'), pg_temp.u('b1'), now() - interval '10 days', pg_temp.u('a1')),
  (pg_temp.u('e4'), pg_temp.u('b1'), now() - interval '40 days', pg_temp.u('a1')),
  (pg_temp.u('e5'), pg_temp.u('b2'), null, null), (pg_temp.u('e6'), pg_temp.u('b1'), null, null),
  (pg_temp.u('e7'), pg_temp.u('b1'), null, null), (pg_temp.u('e8'), pg_temp.u('b1'), null, null);
-- The recovery identities of #1416 (only a hash): X and Z have one, Y does not yet.
insert into public.athlete_recovery_identities (athlete_id, code_hash) values
  (pg_temp.u('e1'), repeat('a', 64)), (pg_temp.u('e3'), repeat('b', 64));
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, parent_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('f1'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), null, 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:00+00'),
  (pg_temp.u('f2'), pg_temp.u('a3'), pg_temp.u('b1'), 'split', pg_temp.u('e1'), pg_temp.u('f1'), 1500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:01+00'),
  (pg_temp.u('f3'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), null, 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 09:00:00+00'),
  (pg_temp.u('f4'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), null, 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 10:00:00+00'),
  (pg_temp.u('f5'), pg_temp.u('a2'), pg_temp.u('b2'), 'repetition', pg_temp.u('e1'), null, 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-e', '2026-11-01 11:00:00+00'),
  (pg_temp.u('f6'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), null, 4100, 'BK', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:30:00+00'),
  (pg_temp.u('f7'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), null, 3900, 'BR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-10-01 08:30:00+00'),
  (pg_temp.u('f8'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e6'), null, 4200, 'FL', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 08:30:00+00'),
  (pg_temp.u('f9'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e7'), null, 4300, 'FL', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 09:30:00+00');
-- f3 discarded and f4 hidden: set as the owner with the triggers off (they recompute hidden and check the discarder).
alter table public.measurements disable trigger user;
update public.measurements set discarded_at = now(), discarded_by = pg_temp.u('a3') where id = pg_temp.u('f3');
update public.measurements set hidden = true where id = pg_temp.u('f4');
alter table public.measurements enable trigger user;

select has_table('public', 'athlete_anonymous_copies', 'the copies table exists');
select ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['select', 'insert', 'update', 'delete']) p
    where has_table_privilege(r, 'public.athlete_anonymous_copies', p)
  ),
  'no client role has any privilege on the copies table, so none reads the identity');
select has_function('public', 'create_anonymous_school_copy', array['uuid', 'uuid'], 'create_anonymous_school_copy exists');
select ok(
  not has_function_privilege('anon', 'public.create_anonymous_school_copy(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.create_anonymous_school_copy(uuid, uuid)', 'execute'),
  'only signed-in users execute create_anonymous_school_copy');

set local role authenticated;

-- 1. Who may copy: only an active admin of the school.
select pg_temp.as_user('a3');
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'a coach cannot copy');
select pg_temp.as_user('a2');
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'an admin of another school cannot copy');
select pg_temp.as_user('a4');
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'a deactivated admin cannot copy');
select pg_temp.as_user('a5');
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'the family cannot copy');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'nobody signed in cannot copy');
select pg_temp.as_user('a1');
select throws_ok($$select * from public.athlete_anonymous_copies$$, '42501', null, 'not even the admin of the school reads the copies table');

-- 2. The admin copies X: an anonymous swimmer with the marks the school reads, keyed by the identity of X.
select is(
  public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "created", "linkable": true, "copied": 2}'::jsonb,
  'the copy is created with the two marks the school reads (the mark and its split), and has a key');
select is(
  (select first_name || ' ' || last_name from public.athletes where id = pg_temp.anon_of('e1')), 'Nadador anónimo',
  'the staff read the copy as an anonymous swimmer');
select is((select count(*)::int from public.measurements where athlete_id = pg_temp.anon_of('e1')), 2, 'the staff read the copied marks');
select is(
  (select string_agg(hundredths::text, ',' order by hundredths) from public.measurements where athlete_id = pg_temp.anon_of('e1')), '1500,3100',
  'the copied marks carry the times');
select ok(
  exists (
    select 1 from public.measurements s join public.measurements p on p.id = s.parent_id
    where s.athlete_id = pg_temp.anon_of('e1') and s.kind = 'split' and p.athlete_id = pg_temp.anon_of('e1') and p.id <> pg_temp.u('f1')
  ),
  'the copied split hangs from the copied mark, not from the original');
reset role;
select is(
  (select count(*)::int from public.measurements where athlete_id = pg_temp.anon_of('e1')), 2,
  'the discarded, the hidden and the other school''s marks were not copied');
select ok(
  (select bool_and(created_by is null) from public.measurements where athlete_id = pg_temp.anon_of('e1'))
  and (select created_by is null from public.athletes where id = pg_temp.anon_of('e1'))
  and (select bool_and(created_by is null) from public.athlete_schools where athlete_id = pg_temp.anon_of('e1')),
  'the copy has no author');
select is(
  (select (select count(*) from public.athlete_managers where athlete_id = pg_temp.anon_of('e1'))
    + (select count(*) from public.athlete_photos where athlete_id = pg_temp.anon_of('e1'))
    + (select count(*) from public.athlete_private_details where athlete_id = pg_temp.anon_of('e1'))
    + (select count(*) from public.authorization_status where athlete_id = pg_temp.anon_of('e1')))::int, 0,
  'the copy has no manager, photo, private details or authorization');
select is(
  (select count(*)::int from public.measurements where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')), 4,
  'the marks of the swimmer stay where they were');
select is(pg_temp.identity_of('e1'), (select id from public.athlete_recovery_identities where athlete_id = pg_temp.u('e1')),
  'the copy keeps the recovery identity of the swimmer, never a text');
set local role authenticated;
select pg_temp.as_user('a5');
select is((select count(*)::int from public.athletes where id = pg_temp.anon_of('e1')), 0, 'the family does not read the copy');
select pg_temp.as_user('a2');
select is((select count(*)::int from public.athletes where id = pg_temp.anon_of('e1')), 0, 'another school does not read the copy');

-- 3. A second call for X copies nothing more.
select pg_temp.as_user('a1');
select is(
  public.create_anonymous_school_copy(pg_temp.u('e1'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "already_copied", "linkable": true, "copied": 0}'::jsonb, 'a second call copies nothing more');
reset role;
select is((select count(*)::int from public.athlete_anonymous_copies where school_id = pg_temp.u('b1')), 1, 'there is still one copy');
set local role authenticated;
select pg_temp.as_user('a1');

-- 4. A swimmer whose owner never got a code is copied without a key. A school action never attaches one, even when the identity exists.
select is(
  public.create_anonymous_school_copy(pg_temp.u('e2'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "created", "linkable": false, "copied": 1}'::jsonb, 'a swimmer without a code is copied without a key and the answer says so');
reset role;
select is(pg_temp.identity_of('e2'), null, 'that copy has no key');
-- The identity appears with the trigger off (as if it had not attached): only a school action could attach it now, and it must not.
alter table public.athlete_recovery_identities disable trigger user;
insert into public.athlete_recovery_identities (athlete_id, code_hash) values (pg_temp.u('e2'), repeat('c', 64));
alter table public.athlete_recovery_identities enable trigger user;
set local role authenticated;
select pg_temp.as_user('a1');
select is(
  public.create_anonymous_school_copy(pg_temp.u('e2'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "already_copied", "linkable": false, "copied": 0}'::jsonb, 'a second school call attaches no key');
reset role;
select is(pg_temp.identity_of('e2'), null, 'the copy is still without a key after the school asked again');
set local role authenticated;
select pg_temp.as_user('a1');

-- 5. Only while the school still reads the swimmer.
select is(
  public.create_anonymous_school_copy(pg_temp.u('e3'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "created", "linkable": true, "copied": 1}'::jsonb, 'a link ended 10 days ago is still inside the window');
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e4'), pg_temp.u('b1'))$$, 'P0001', 'no_school_access',
  'a link ended 40 days ago is outside the window');
select throws_ok($$select public.create_anonymous_school_copy(pg_temp.u('e5'), pg_temp.u('b1'))$$, 'P0001', 'no_school_access',
  'a swimmer the school never had fails');
select throws_ok($$select public.create_anonymous_school_copy(gen_random_uuid(), pg_temp.u('b1'))$$, 'P0001', 'no_school_access',
  'a swimmer that does not exist fails the same way');
select throws_ok(
  format($$select public.create_anonymous_school_copy(%L, %L)$$, pg_temp.anon_of('e1'), pg_temp.u('b1')), 'P0001', 'already_anonymous',
  'a copy cannot be copied');

-- 6. The owner issues the code later: the copy gets the key. When the account is erased first, it stays unlinkable for good.
select is(
  public.create_anonymous_school_copy(pg_temp.u('e6'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "created", "linkable": false, "copied": 1}'::jsonb, 'the copy of P is made before P has a code');
select pg_temp.as_user('a6');
select lives_ok($$select * from public.issue_athlete_recovery_code(pg_temp.u('e6'))$$, 'the owner of P issues the code');
reset role;
select is(pg_temp.identity_of('e6'), (select id from public.athlete_recovery_identities where athlete_id = pg_temp.u('e6')),
  'issuing the code attached the identity to the copy made before');
set local role authenticated;
select pg_temp.as_user('a1');
select is(
  public.create_anonymous_school_copy(pg_temp.u('e7'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "created", "linkable": false, "copied": 1}'::jsonb, 'the copy of Q is made before Q has a code');
-- The account of Q is erased: the manager row goes and the swimmer stays as a marker, as erase_account leaves it.
reset role;
delete from public.athlete_managers where athlete_id = pg_temp.u('e7');
update public.athletes set first_name = 'Nadador', last_name = 'anterior', created_by = null where id = pg_temp.u('e7');
set local role authenticated;
select pg_temp.as_user('a7');
select throws_ok($$select * from public.issue_athlete_recovery_code(pg_temp.u('e7'))$$, '42501', null, 'nobody can issue a code for Q after the erasure');
reset role;
select ok(
  pg_temp.identity_of('e7') is null and not exists (select 1 from public.athlete_recovery_identities where athlete_id = pg_temp.u('e7')),
  'the copy of Q stays unlinkable for good');
set local role authenticated;
select pg_temp.as_user('a1');
select is(
  public.create_anonymous_school_copy(pg_temp.u('e8'), pg_temp.u('b1')) - 'athlete_id',
  '{"status": "created", "linkable": false, "copied": 0}'::jsonb, 'the copy of R (no marks) is made before R has a code');
reset role;
select set_config('anon.r', pg_temp.anon_of('e8')::text, true);
delete from public.athlete_schools where athlete_id = pg_temp.u('e8');
delete from public.athletes where id = pg_temp.u('e8');
select ok(
  exists (select 1 from public.athlete_anonymous_copies where athlete_id = current_setting('anon.r')::uuid
    and source_athlete_id is null and identity_id is null),
  'when the swimmer is deleted before any code the copy stays, unlinked and pointing at nobody');

select * from finish();
rollback;
