-- The owner opens a swimmer's marks of other schools to one school (issue #1446). Rule confirmed by the maintainer (2026-11-22): "Puede
-- estar en las dos pero los datos de A los ve A y B los ve B y el usuario puede ver los dos.", "pero tambien el nadador puede aprobar
-- compartir los datos a la escuela". The guardian or the adult swimmer (athlete_managers) grants a school where the swimmer is active
-- with grant_athlete_result_sharing and withdraws it with revoke_athlete_result_sharing; public.other_school_results gets one more path.
-- Schools: A (b1), C (b2), D (b3). Users: admin of A (a1), admin of C (a2), coach KC of C with X assigned (a3), coach KC2 of C without
-- anybody assigned (a4), guardian G (a5), adult swimmer Y (a6), another guardian H of a swimmer only in A (a7), platform admin (a8),
-- guardian T of swimmer T (a9), admin of D (aa). All users and data here are synthetic.
-- Swimmers: X (e1) active in A and C, G; Y (e2) adult, active in A and C; Z (e3) only in A, G; V (e4) A and C, G; U (e5) A and C, G;
-- T (e6) A and C, guardian T; S (e7) A and C, G (the pair of #68); R (e8) ended in A, G accepts C (the history of #1419);
-- Q (e9) A and C, G (the authorization is withdrawn); P (ea) only in A, H.
begin;
create extension if not exists pgtap with schema extensions;
select plan(87);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14460000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
create function pg_temp.at() returns timestamptz language sql as $$ select '2026-11-01 10:00:00+00'::timestamptz $$;
create function pg_temp.text_of(p text) returns uuid language sql as $$
  select id from public.authorization_texts where purpose = p and language = 'es-CO' order by version limit 1 $$;
create function pg_temp.auths(seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', md5(seed || p)::uuid, 'purpose', p, 'text_id', pg_temp.text_of(p)) order by p)
  from unnest(array['record_times', 'import_official_results', 'share_results_with_school']) as p $$;
-- What the current user reads of the swimmer through other_school_results, as one line of mark ids.
create function pg_temp.history(athlete text) returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.other_school_results(pg_temp.u(athlete)) $$;
-- The owner's stream athletes_result_sharing of powersync/sync-config.yaml with the set managed_athlete_ids: the rows in force of the
-- swimmers the user manages, gated by account_sync_access. A copy, only as good as the text it copies: the stream test of the module
-- (src/modules/athletes/__tests__/ownerResultSharingSyncStream.test.ts) pins the text, so change them together.
create function pg_temp.stream_sharing(uuid) returns table (athlete_id uuid, target_school_id uuid) language sql as $$
  select r.athlete_id, r.target_school_id from public.athlete_result_sharing r
    where r.revoked_at is null
      and r.athlete_id in (select m.athlete_id from public.athlete_managers m where m.user_id = $1
        and $1 in (select s.user_id from public.account_sync_access s where s.user_id = $1)) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'admin-a@example.test'), (pg_temp.u('a2'), 'admin-c@example.test'), (pg_temp.u('a3'), 'coach-kc@example.test'),
  (pg_temp.u('a4'), 'coach-kc2@example.test'), (pg_temp.u('a5'), 'guardian-g@example.test'), (pg_temp.u('a6'), 'adult-y@example.test'),
  (pg_temp.u('a7'), 'guardian-h@example.test'), (pg_temp.u('a8'), 'platform@example.test'), (pg_temp.u('a9'), 'guardian-t@example.test'),
  (pg_temp.u('aa'), 'admin-d@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a8'));
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Owner School A'), (pg_temp.u('b2'), 'Owner School C'), (pg_temp.u('b3'), 'Owner School D');
insert into public.training_groups (id, school_id, name) values (pg_temp.u('c2'), pg_temp.u('b2'), 'Group C');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a2'), 'school_admin'),
  (pg_temp.u('b2'), pg_temp.u('a3'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b3'), pg_temp.u('aa'), 'school_admin');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Athlete', 'Y'), (pg_temp.u('e3'), 'Athlete', 'Z'), (pg_temp.u('e4'), 'Athlete', 'V'),
  (pg_temp.u('e5'), 'Athlete', 'U'), (pg_temp.u('e6'), 'Athlete', 'T'), (pg_temp.u('e7'), 'Athlete', 'S'), (pg_temp.u('e8'), 'Athlete', 'R'),
  (pg_temp.u('e9'), 'Athlete', 'Q'), (pg_temp.u('ea'), 'Athlete', 'P');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a5'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a6'), pg_temp.u('e2'), 'self'), (pg_temp.u('a5'), pg_temp.u('e3'), 'guardian'),
  (pg_temp.u('a5'), pg_temp.u('e4'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e5'), 'guardian'), (pg_temp.u('a9'), pg_temp.u('e6'), 'guardian'),
  (pg_temp.u('a5'), pg_temp.u('e7'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e8'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e9'), 'guardian'),
  (pg_temp.u('a7'), pg_temp.u('ea'), 'guardian');
-- Everyone is in A; all but Z, R and P are also in C. R is moved to ended below.
insert into public.athlete_schools (athlete_id, school_id)
  select pg_temp.u(e), pg_temp.u('b1') from unnest(array['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'ea']) as e;
insert into public.athlete_schools (athlete_id, school_id)
  select pg_temp.u(e), pg_temp.u('b2') from unnest(array['e1', 'e2', 'e4', 'e5', 'e6', 'e7', 'e9']) as e;
-- KC has X assigned in C; KC2 nobody. The owner does this fixture work without a signed-in user.
select set_config('request.jwt.claims', '', true);
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a3'), pg_temp.u('e1'), pg_temp.u('b2')), (pg_temp.u('a3'), pg_temp.u('e2'), pg_temp.u('b2'));
-- The share_results_with_school authorization of the family, for every swimmer that has it (R gets it by accepting the invitation of C).
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
  select pg_temp.u(m), pg_temp.u(e), 'share_results_with_school', pg_temp.text_of('share_results_with_school'), now() - interval '1 day'
  from (values ('a5', 'e1'), ('a6', 'e2'), ('a5', 'e4'), ('a5', 'e5'), ('a9', 'e6'), ('a5', 'e7'), ('a5', 'e9')) as v(m, e);
-- X has a record_times authorization withdrawn on 2026-10-10: what X swims after it is hidden.
insert into public.authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at)
  values (pg_temp.u('d0'), pg_temp.u('a5'), pg_temp.u('e1'), 'record_times', pg_temp.text_of('record_times'), '2026-10-01 08:00:00+00');
update public.authorizations set withdrawn_at = '2026-10-10 08:00:00+00' where id = pg_temp.u('d0');
-- f1 X race in A (the only mark of X that C may read), f2 split in A, f3 discarded in A, f4 hidden in A, f5 race of X in C.
insert into public.measurements
  (id, kind, athlete_id, school_id, hundredths, stroke, distance, pool, session_type, source, device_id, created_by, captured_at, parent_id, arrival_position)
values
  (pg_temp.u('f1'), 'race', pg_temp.u('e1'), pg_temp.u('b1'), 3482, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 08:00:00+00', null, null),
  (pg_temp.u('f2'), 'split', pg_temp.u('e1'), pg_temp.u('b1'), 1650, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 08:00:00+00', pg_temp.u('f1'), null),
  (pg_temp.u('f4'), 'repetition', pg_temp.u('e1'), pg_temp.u('b1'), 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-a', pg_temp.u('a1'), '2026-10-12 08:00:00+00', null, 1),
  (pg_temp.u('f5'), 'race', pg_temp.u('e1'), pg_temp.u('b2'), 3500, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-c', pg_temp.u('a2'), '2026-10-06 08:00:00+00', null, null),
  (pg_temp.u('f6'), 'race', pg_temp.u('e2'), pg_temp.u('b1'), 3700, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 09:00:00+00', null, null),
  (pg_temp.u('f7'), 'race', pg_temp.u('e4'), pg_temp.u('b1'), 3710, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 10:00:00+00', null, null),
  (pg_temp.u('f8'), 'race', pg_temp.u('e5'), pg_temp.u('b1'), 3720, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 11:00:00+00', null, null),
  (pg_temp.u('f9'), 'race', pg_temp.u('e6'), pg_temp.u('b1'), 3730, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 12:00:00+00', null, null),
  (pg_temp.u('fa'), 'race', pg_temp.u('e7'), pg_temp.u('b1'), 3740, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 13:00:00+00', null, null),
  (pg_temp.u('fb'), 'race', pg_temp.u('e8'), pg_temp.u('b1'), 3750, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 14:00:00+00', null, null),
  (pg_temp.u('fc'), 'race', pg_temp.u('e9'), pg_temp.u('b1'), 3760, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-05 15:00:00+00', null, null);
insert into public.measurements
  (id, kind, athlete_id, school_id, hundredths, stroke, distance, pool, session_type, source, device_id, created_by, captured_at, discarded_at, discarded_by)
values
  (pg_temp.u('f3'), 'race', pg_temp.u('e1'), pg_temp.u('b1'), 3400, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch', 'dev-a', pg_temp.u('a1'), '2026-10-08 08:00:00+00', '2026-10-08 09:00:00+00', pg_temp.u('a1'));
select is((select hidden from public.measurements where id = pg_temp.u('f4')), true, 'fixture: f4 is hidden by the record_times withdrawal');

select has_table('public', 'athlete_result_sharing', 'the table of the owner''s sharing exists');
select is((select relrowsecurity from pg_class where oid = 'public.athlete_result_sharing'::regclass), true, 'row level security is on');
select is(
  (select count(*) from pg_catalog.pg_publication_tables where pubname = 'powersync' and schemaname = 'public' and tablename = 'athlete_result_sharing'),
  1::bigint, 'the table is in the powersync publication');
select is((select array_agg(confdeltype::text order by conname) from pg_constraint
  where conrelid = 'public.athlete_result_sharing'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass),
  array['n', 'n'], 'granted_by and revoked_by empty themselves when the user is erased (on delete set null)');
select is((select confdeltype::text from pg_constraint
  where conrelid = 'public.athlete_result_sharing'::regclass and contype = 'f' and confrelid = 'public.athletes'::regclass),
  'c', 'a deleted swimmer takes its rows with it');

-- 1. Both active, no row: each school reads only its own marks.
set local role authenticated;
select pg_temp.as_user('a2');
select is(pg_temp.history('e1'), '', 'X active in A and C, no sharing: the admin of C reads nothing of A');
select pg_temp.as_user('a3');
select is(pg_temp.history('e1'), '', 'the coach of C reads nothing of A either');
select pg_temp.as_user('a1');
select is(pg_temp.history('e1'), '', 'and the admin of A reads nothing of what C recorded');

-- 2. The guardian opens X to C.
select pg_temp.as_user('a5');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, 'the guardian of X opens the results to C');
select is((select count(*)::int from public.athlete_result_sharing where athlete_id = pg_temp.u('e1') and revoked_at is null), 1, 'one row in force');
select is((select granted_by from public.athlete_result_sharing where athlete_id = pg_temp.u('e1')), pg_temp.u('a5'), 'the row says who granted');
select is(public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')), (select id from public.athlete_result_sharing where athlete_id = pg_temp.u('e1') and revoked_at is null),
  'a repeated grant returns the row in force');
select is((select count(*)::int from public.athlete_result_sharing where athlete_id = pg_temp.u('e1')), 1, 'and creates nothing');
select pg_temp.as_user('a2');
select is(pg_temp.history('e1'), 'f1', 'the admin of C reads the race of X in A, not its split, the discarded one, the hidden one or its own');
select pg_temp.as_user('a3');
select is(pg_temp.history('e1'), 'f1', 'the coach of C with X assigned reads it too');
select pg_temp.as_user('a4');
select is(pg_temp.history('e1'), '', 'the coach of C without X assigned reads nothing');
select pg_temp.as_user('a1');
select is(pg_temp.history('e1'), '', 'the admin of A still reads nothing of what C recorded: the choice is per school');
select pg_temp.as_user('aa');
select is(pg_temp.history('e1'), '', 'a third school never gets it');

-- 3. Withdrawing, and opening again.
select pg_temp.as_user('a5');
select is(public.revoke_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')), 1, 'the guardian withdraws it');
select pg_temp.as_user('a2');
select is(pg_temp.history('e1'), '', 'C stops reading at the next read');
select pg_temp.as_user('a5');
select is((select revoked_by = pg_temp.u('a5') and revoked_at is not null from public.athlete_result_sharing where athlete_id = pg_temp.u('e1')), true,
  'the row stays with who and when');
select is(public.revoke_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')), 0, 'withdrawing again closes nothing');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, 'the guardian opens it again');
select is((select count(*)::int from public.athlete_result_sharing where athlete_id = pg_temp.u('e1')), 2, 'a new row is made, the history is kept');
select pg_temp.as_user('a2');
select is(pg_temp.history('e1'), 'f1', 'C reads again');

-- 4. Who cannot: staff of any school, another guardian, the platform admin, nobody signed in.
select pg_temp.as_user('a1');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b1')) $$, '42501', null, 'the admin of A cannot grant for X');
select throws_ok($$ select public.revoke_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'nor withdraw');
select pg_temp.as_user('a2');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'the admin of C cannot grant for X');
select throws_ok($$ select public.revoke_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'nor withdraw the row that opens C');
select pg_temp.as_user('a3');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'a coach cannot grant');
select pg_temp.as_user('a7');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'another guardian cannot grant for X');
select throws_ok($$ select public.revoke_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'nor withdraw');
select pg_temp.as_user('a8');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'the platform admin cannot grant');
select is((select count(*)::int from public.athlete_result_sharing), 0, 'and reads no row');
select pg_temp.as_user('a2');
select is((select count(*)::int from public.athlete_result_sharing), 0, 'the admin of C reads no row: the school never sees the owner''s choices');
select pg_temp.as_user('a1');
select is((select count(*)::int from public.athlete_result_sharing), 0, 'nor the admin of A');
select pg_temp.as_user('a7');
select is((select count(*)::int from public.athlete_result_sharing), 0, 'nor another guardian');
select pg_temp.as_user('a5');
select is((select count(*)::int from public.athlete_result_sharing), 2, 'the guardian of X reads the rows of X');
reset role;
set local role anon;
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b2')) $$, '42501', null, 'anon cannot call the function');
reset role;

-- 5. A client role never writes the table directly.
set local role authenticated;
select pg_temp.as_user('a5');
select throws_ok($$ insert into public.athlete_result_sharing (athlete_id, target_school_id, granted_by) values (pg_temp.u('e3'), pg_temp.u('b2'), pg_temp.u('a5')) $$,
  '42501', null, 'the guardian cannot insert a row directly');
select throws_ok($$ update public.athlete_result_sharing set revoked_at = now() where athlete_id = pg_temp.u('e1') $$, '42501', null, 'nor update one');
select throws_ok($$ delete from public.athlete_result_sharing where athlete_id = pg_temp.u('e1') $$, '42501', null, 'nor delete one');
select pg_temp.as_user('a2');
select throws_ok($$ insert into public.athlete_result_sharing (athlete_id, target_school_id) values (pg_temp.u('e4'), pg_temp.u('b2')) $$,
  '42501', null, 'a school cannot insert one: it is not their choice');
select pg_temp.as_user('a8');
select throws_ok($$ insert into public.athlete_result_sharing (athlete_id, target_school_id) values (pg_temp.u('e4'), pg_temp.u('b2')) $$,
  '42501', null, 'neither can the platform admin');
reset role;
select is(has_table_privilege('authenticated', 'public.athlete_result_sharing', 'select') and not has_table_privilege('authenticated', 'public.athlete_result_sharing', 'insert, update, delete'),
  true, 'clients can only select, through the policy');
select is(has_table_privilege('anon', 'public.athlete_result_sharing', 'select'), false, 'anon reads nothing');

-- 6. Only a school where the swimmer is active.
set local role authenticated;
select pg_temp.as_user('a5');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e3'), pg_temp.u('b2')) $$, '22023', null, 'Z is not in C: it cannot be opened to C');
select throws_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e1'), pg_temp.u('b3')) $$, '22023', null, 'X is not in D: it cannot be opened to D');
-- 7. An adult swimmer is its own owner.
select pg_temp.as_user('a6');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e2'), pg_temp.u('b2')) $$, 'the adult swimmer opens the results to C');
select pg_temp.as_user('a3');
select is(pg_temp.history('e2'), 'f6', 'the coach of C, with Y assigned, reads the race of Y in A');

-- 8. The conditions stay: the authorization withdrawn, a link ended.
select pg_temp.as_user('a5');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e9'), pg_temp.u('b2')) $$, 'the guardian opens Q to C');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e4'), pg_temp.u('b2')) $$, 'and V to C');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e5'), pg_temp.u('b2')) $$, 'and U to C');
select pg_temp.as_user('a2');
select is(pg_temp.history('e9'), 'fc', 'C reads Q');
select pg_temp.as_user('a5');
select lives_ok($$ update public.authorizations set withdrawn_at = now() where athlete_id = pg_temp.u('e9') and purpose = 'share_results_with_school' $$,
  'the guardian withdraws the sharing authorization of Q');
select pg_temp.as_user('a2');
select is(pg_temp.history('e9'), '', 'with the row in force but the authorization withdrawn, C reads nothing');
select is(pg_temp.history('e4'), 'f7', 'C reads V');
select public.end_athlete_school(pg_temp.u('e4'), pg_temp.u('b2'));
select is(pg_temp.history('e4'), '', 'the link of V in C ended: the row gives C nothing');
select pg_temp.as_user('a1');
select is(pg_temp.history('e5'), '', 'before A ends U, A reads nothing of C either');
select public.end_athlete_school(pg_temp.u('e5'), pg_temp.u('b1'));
select pg_temp.as_user('a2');
select is(pg_temp.history('e5'), '', 'the link of U in A ended: the row gives C nothing of A through the owner''s path');

-- 9. The stream gives the owner only the rows in force of their swimmers.
reset role;
select is((select array_agg(athlete_id order by athlete_id) from pg_temp.stream_sharing(pg_temp.u('a5'))),
  (select array_agg(x order by x) from unnest(array[pg_temp.u('e1'), pg_temp.u('e4'), pg_temp.u('e5'), pg_temp.u('e9')]) as x),
  'the stream gives the guardian the rows in force of their swimmers: the withdrawn row of X is not there twice');
select is((select count(*)::int from pg_temp.stream_sharing(pg_temp.u('a5')) where athlete_id = pg_temp.u('e1')), 1, 'one row in force for X, not the withdrawn one');
select is((select array_agg(athlete_id) from pg_temp.stream_sharing(pg_temp.u('a6'))), array[pg_temp.u('e2')], 'the adult swimmer gets their own row');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a7'))), 0::bigint, 'another guardian gets nothing');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a2'))), 0::bigint, 'the admin of C gets nothing');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a3'))), 0::bigint, 'the coach of C gets nothing');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a1'))), 0::bigint, 'the admin of A gets nothing');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a8'))), 0::bigint, 'the platform admin gets nothing (online support)');
update public.athlete_result_sharing set revoked_at = now() where athlete_id = pg_temp.u('e9');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a5')) where athlete_id = pg_temp.u('e9')), 0::bigint, 'a withdrawn row leaves the stream');

-- 10. The erasure of the guardian who opened T. A guardian of a swimmer still active in a school cannot erase the account, so both links
-- of T end first (the real order): the row of the owner stays, with no user in it, whether it was withdrawn (revoked_by emptied, revoked_at
-- kept: the check of #1434 must allow it) or still in force, and the authorization goes with the account, so a row left behind opens nothing.
set local role authenticated;
select pg_temp.as_user('a9');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e6'), pg_temp.u('b2')) $$, 'the guardian of T opens T to C');
select pg_temp.as_user('a2');
select is(pg_temp.history('e6'), 'f9', 'C reads the mark of T recorded in A');
select pg_temp.as_user('a9');
select is(public.revoke_athlete_result_sharing(pg_temp.u('e6'), pg_temp.u('b2')), 1, 'the guardian of T withdraws it');
select lives_ok($$ select public.grant_athlete_result_sharing(pg_temp.u('e6'), pg_temp.u('b2')) $$, 'and opens it again: one withdrawn row, one in force');
select pg_temp.as_user('a1');
select public.end_athlete_school(pg_temp.u('e6'), pg_temp.u('b1'));
select pg_temp.as_user('a2');
select public.end_athlete_school(pg_temp.u('e6'), pg_temp.u('b2'));
reset role;
select set_config('request.jwt.claims', '', true);
create temp table req on commit drop as select public.request_account_deletion(pg_temp.u('a9')) ->> 'code' as code;
select public.confirm_account_deletion(pg_temp.u('a9'), (select code from req));
update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u('a9');
select is((public.erase_account((select id from public.account_deletion_requests where user_id = pg_temp.u('a9'))) ->> 'status'), 'deleted', 'the guardian of T erases the account');
select is((select count(*)::int from public.athlete_result_sharing where athlete_id = pg_temp.u('e6') and granted_by is null and revoked_by is null), 2,
  'both rows of T stay, with no user in them');
select is((select count(*)::int from public.athlete_result_sharing where athlete_id = pg_temp.u('e6') and revoked_at is not null), 1, 'and the withdrawal keeps its date');
select is((select count(*)::int from public.authorizations where athlete_id = pg_temp.u('e6')), 0, 'the authorization of T went with the account');
select is((select count(*) from pg_temp.stream_sharing(pg_temp.u('a9'))), 0::bigint, 'and the erased user has no stream');
set local role authenticated;
select pg_temp.as_user('a2');
select is(pg_temp.history('e6'), '', 'after the erasure C reads nothing of T');
reset role;

-- 11. The pair of #68 keeps working, with no row of the owner.
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select pg_temp.as_user('a2');
select is(pg_temp.history('e7'), '', 'S active in A and C, nothing shared: C reads nothing');
select is(public.request_result_sharing(pg_temp.u('e7'), pg_temp.u('b2')), 1, 'the admin of C asks A for S');
select pg_temp.as_user('a1');
select lives_ok(
  $$ select public.approve_result_sharing((select id from public.school_result_sharing where school_id = pg_temp.u('b1') and target_school_id = pg_temp.u('b2') and withdrawn_at is null)) $$,
  'the admin of A approves C');
select pg_temp.as_user('a2');
select is(pg_temp.history('e7'), 'fa', 'the approved pair of #68 still gives C the mark of S');
reset role;
select is((select count(*)::int from public.athlete_result_sharing where athlete_id = pg_temp.u('e7')), 0, 'without any row of the owner');

-- 12. The history of a transfer (#1419) keeps working: R ended in A, the family accepts C.
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select pg_temp.as_user('a2');
insert into public.school_invitations (id, school_id, group_id) values (pg_temp.u('01'), pg_temp.u('b2'), pg_temp.u('c2'));
select pg_temp.as_user('a1');
select public.end_athlete_school(pg_temp.u('e8'), pg_temp.u('b1'));
reset role;
select set_config('test.token', (select token from public.school_invitations where id = pg_temp.u('01')), true);
set local role authenticated;
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('r')) $$, current_setting('test.token'), pg_temp.u('e8')),
  'the family accepts the invitation of C for R');
select pg_temp.as_user('a2');
select is(pg_temp.history('e8'), 'fb', 'C reads the history of R recorded in A, with no row of the owner');
reset role;

select * from finish();
rollback;
