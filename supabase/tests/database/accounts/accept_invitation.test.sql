-- Accepting a school invitation (issue #44): a guardian or an adult athlete
-- links one of their own athletes to the invitation's school and group. Since
-- #1328 the same call records the three authorizations of joining a school
-- (record_times, import_official_results, share_results_with_school) as evidence,
-- in one transaction. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- The device time of every acceptance in this test.
create function pg_temp.at() returns timestamptz language sql as $$ select '2026-11-01 10:00:00+00'::timestamptz $$;
-- The first version of the text of a purpose in es-CO.
create function pg_temp.text_of(p text) returns uuid language sql as $$
  select id from public.authorization_texts where purpose = p and language = 'es-CO' order by version limit 1 $$;
-- The three objects the app sends. The ids are derived from the seed (one per athlete), so a retry sends the same ids.
create function pg_temp.auths(seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', md5(seed || p)::uuid, 'purpose', p, 'text_id', pg_temp.text_of(p)) order by p)
  from unnest(array['record_times', 'import_official_results', 'share_results_with_school']) as p $$;

-- Users: guardian G, adult athlete A, other guardian O, school admin S of school one.
insert into auth.users (id, email) values
  ('44000000-0000-4000-8000-0000000000a1', 'guardian-g@example.test'),
  ('44000000-0000-4000-8000-0000000000a2', 'adult-a@example.test'),
  ('44000000-0000-4000-8000-0000000000a3', 'guardian-o@example.test'),
  ('44000000-0000-4000-8000-0000000000a4', 'admin-s@example.test');

insert into public.schools (id, name) values
  ('44000000-0000-4000-8000-0000000000b1', 'Accept School One'),
  ('44000000-0000-4000-8000-0000000000b2', 'Accept School Two');

insert into public.training_groups (id, school_id, name) values
  ('44000000-0000-4000-8000-0000000000d1', '44000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('44000000-0000-4000-8000-0000000000d2', '44000000-0000-4000-8000-0000000000b2', 'Group Two');

-- c1 and c2 active in school one, c3 of school two, c4 inactive in school one.
insert into public.categories (id, school_id, name, active) values
  ('44000000-0000-4000-8000-0000000000c1', '44000000-0000-4000-8000-0000000000b1', 'Category One', true),
  ('44000000-0000-4000-8000-0000000000c2', '44000000-0000-4000-8000-0000000000b1', 'Category Two', true),
  ('44000000-0000-4000-8000-0000000000c3', '44000000-0000-4000-8000-0000000000b2', 'Category Three', true),
  ('44000000-0000-4000-8000-0000000000c4', '44000000-0000-4000-8000-0000000000b1', 'Category Four', false);

insert into public.school_memberships (school_id, user_id, role) values
  ('44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-0000000000a4', 'school_admin');

-- e1, e5, e6, e7: G's athletes. e2: A himself. e3: O's athlete. e4: nobody's.
insert into public.athletes (id, first_name, last_name) values
  ('44000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('44000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('44000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('44000000-0000-4000-8000-0000000000e4', 'Athlete', 'E4'),
  ('44000000-0000-4000-8000-0000000000e5', 'Athlete', 'E5'),
  ('44000000-0000-4000-8000-0000000000e6', 'Athlete', 'E6'),
  ('44000000-0000-4000-8000-0000000000e7', 'Athlete', 'E7');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('44000000-0000-4000-8000-0000000000a1', '44000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('44000000-0000-4000-8000-0000000000a2', '44000000-0000-4000-8000-0000000000e2', 'self'),
  ('44000000-0000-4000-8000-0000000000a3', '44000000-0000-4000-8000-0000000000e3', 'guardian'),
  ('44000000-0000-4000-8000-0000000000a1', '44000000-0000-4000-8000-0000000000e5', 'guardian'),
  ('44000000-0000-4000-8000-0000000000a1', '44000000-0000-4000-8000-0000000000e6', 'guardian'),
  ('44000000-0000-4000-8000-0000000000a1', '44000000-0000-4000-8000-0000000000e7', 'guardian');

-- e3 is already in school two; e5 is already in school one with category c2 and no group.
insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('44000000-0000-4000-8000-0000000000e3', '44000000-0000-4000-8000-0000000000b2', '44000000-0000-4000-8000-0000000000c3'),
  ('44000000-0000-4000-8000-0000000000e5', '44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-0000000000c2');
insert into public.athlete_groups (athlete_id, group_id) values
  ('44000000-0000-4000-8000-0000000000e3', '44000000-0000-4000-8000-0000000000d2');

-- The admin creates three invitations to school one, group one; triggers set the server values.
set local role authenticated;
set local request.jwt.claims = '{"sub": "44000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
insert into public.school_invitations (id, school_id, group_id) values
  ('44000000-0000-4000-8000-000000000101', '44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-0000000000d1'),
  ('44000000-0000-4000-8000-000000000102', '44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-0000000000d1'),
  ('44000000-0000-4000-8000-000000000103', '44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-0000000000d1');
update public.school_invitations set revoked_at = now() where id = '44000000-0000-4000-8000-000000000103';
reset role;

-- Expire 102 as the table owner: the guard trigger only allows revocation.
alter table public.school_invitations disable trigger school_invitations_guard_update;
update public.school_invitations set expires_at = now() - interval '1 second'
where id = '44000000-0000-4000-8000-000000000102';
alter table public.school_invitations enable trigger school_invitations_guard_update;

do $$ begin
  perform set_config('test.valid', (select token from public.school_invitations where id = '44000000-0000-4000-8000-000000000101'), true);
  perform set_config('test.expired', (select token from public.school_invitations where id = '44000000-0000-4000-8000-000000000102'), true);
  perform set_config('test.revoked', (select token from public.school_invitations where id = '44000000-0000-4000-8000-000000000103'), true);
end $$;

-- Function shape and grants
select ok(
  (select prosecdef and coalesce(proconfig, '{}') @> array['search_path=""']
   from pg_proc where oid = 'public.accept_invitation(text, uuid, uuid, timestamptz, jsonb)'::regprocedure),
  'accept_invitation is security definer with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.accept_invitation(text, uuid, uuid, timestamptz, jsonb)', 'execute'),
  'anon cannot execute accept_invitation'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_invitation(text, uuid, uuid, timestamptz, jsonb)', 'execute'),
  'authenticated can execute accept_invitation'
);
select hasnt_function('public', 'accept_invitation', array['text', 'uuid', 'uuid'], 'the three-argument accept_invitation no longer exists');

-- A second, newer text of record_times: the app may send the version it showed, which is not always the latest.
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('44000000-0000-4000-8000-000000000201', 'record_times', 99, 'es-CO', 'Synthetic record times text v99');

-- No session
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', null, pg_temp.at(), pg_temp.auths('e1')) $$,
  '42501', null,
  'a call without a signed-in user is refused'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "44000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', '44000000-0000-4000-8000-0000000000c1', pg_temp.at(), pg_temp.auths('e1')) $$,
  'a guardian accepts for their own athlete with a category'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e6', null, pg_temp.at(), pg_temp.auths('e6')) $$,
  'a guardian accepts without a category'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', '44000000-0000-4000-8000-0000000000c3', pg_temp.at(), pg_temp.auths('e7')) $$,
  '22023', null,
  'a category of another school is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', '44000000-0000-4000-8000-0000000000c4', pg_temp.at(), pg_temp.auths('e7')) $$,
  '23514', null,
  'an inactive category is refused by the existing trigger'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e3', null, pg_temp.at(), pg_temp.auths('e3')) $$,
  '42501', null,
  'an athlete managed by someone else is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e4', null, pg_temp.at(), pg_temp.auths('e4')) $$,
  '42501', null,
  'an athlete with no manager is refused'
);
select throws_ok(
  $$ select public.accept_invitation('no-such-token-0123456789abcdef0123456', '44000000-0000-4000-8000-0000000000e3', null, pg_temp.at(), pg_temp.auths('e3')) $$,
  '42501', null,
  'the athlete is checked before the token'
);
select throws_ok(
  $$ select public.accept_invitation('no-such-token-0123456789abcdef0123456', '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), pg_temp.auths('e7')) $$,
  'P0002', 'invitation not found',
  'an unknown token is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.expired'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), pg_temp.auths('e7')) $$,
  'P0002', 'invitation not found',
  'an expired token is refused like an unknown one'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.revoked'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), pg_temp.auths('e7')) $$,
  'P0002', 'invitation not found',
  'a revoked token is refused like an unknown one'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', '44000000-0000-4000-8000-0000000000c1', pg_temp.at(), pg_temp.auths('e1')) $$,
  'accepting the same invitation twice raises no error'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e5', '44000000-0000-4000-8000-0000000000c1', pg_temp.at(), pg_temp.auths('e5')) $$,
  'a guardian accepts for an athlete already in the school'
);

-- The authorizations (guardian G still signed in). The objects are sorted by purpose: 0 import_official_results,
-- 1 record_times, 2 share_results_with_school. Every refusal is for e7, which must end with nothing written.
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), pg_temp.auths('e7') - 2) $$,
  '22023', null,
  'a missing purpose is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), (pg_temp.auths('e7') - 2) || (pg_temp.auths('e7') -> 1)) $$,
  '22023', null,
  'a repeated purpose is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), jsonb_set(pg_temp.auths('e7'), '{2,purpose}', '"show_photo"')) $$,
  '22023', null,
  'a purpose other than the three is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, null, pg_temp.auths('e7')) $$,
  '22023', null,
  'a missing device time is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), null) $$,
  '22023', null,
  'a missing authorizations list is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(),
       jsonb_set(pg_temp.auths('e7'), '{2,text_id}', to_jsonb(pg_temp.text_of('record_times')))) $$,
  '22023', null,
  'a text of another purpose is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', null, pg_temp.at(), pg_temp.auths('e1')) $$,
  '42501', null,
  'ids already used for another athlete are refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', null, pg_temp.at(),
       jsonb_set(jsonb_set(pg_temp.auths('e1'), '{0,id}', pg_temp.auths('e1') -> 1 -> 'id'), '{1,id}', pg_temp.auths('e1') -> 0 -> 'id')) $$,
  '42501', null,
  'ids already used for another purpose are refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', null, pg_temp.at(),
       jsonb_set(pg_temp.auths('e1'), '{1,text_id}', '"44000000-0000-4000-8000-000000000201"')) $$,
  '42501', null,
  'ids already used for another text are refused'
);

-- Adult athlete A
set local request.jwt.claims = '{"sub": "44000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e2', null, pg_temp.at(), pg_temp.auths('e1')) $$,
  '42501', null,
  'ids already used by another user are refused'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e2', '44000000-0000-4000-8000-0000000000c1', pg_temp.at(), pg_temp.auths('e2')) $$,
  'an adult athlete accepts for themselves'
);

reset role;

-- What was written
select results_eq(
  $$ select school_id, category_id, created_by from public.athlete_schools
     where athlete_id = '44000000-0000-4000-8000-0000000000e1' $$,
  $$ values ('44000000-0000-4000-8000-0000000000b1'::uuid, '44000000-0000-4000-8000-0000000000c1'::uuid,
             '44000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'the athlete is linked to the invitation school with the category, created by the guardian, once'
);
select results_eq(
  $$ select group_id, created_by from public.athlete_groups
     where athlete_id = '44000000-0000-4000-8000-0000000000e1' $$,
  $$ values ('44000000-0000-4000-8000-0000000000d1'::uuid, '44000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'the athlete is linked to the invitation group, created by the guardian, once'
);
select results_eq(
  $$ select school_id, category_id from public.athlete_schools
     where athlete_id = '44000000-0000-4000-8000-0000000000e6' $$,
  $$ values ('44000000-0000-4000-8000-0000000000b1'::uuid, null::uuid) $$,
  'without a category the link has no category'
);
select is(
  (select count(*) from public.athlete_groups
   where athlete_id = '44000000-0000-4000-8000-0000000000e6' and group_id = '44000000-0000-4000-8000-0000000000d1'),
  1::bigint,
  'without a category the group link is still written'
);
select results_eq(
  $$ select s.school_id, s.category_id, g.group_id from public.athlete_schools s
     join public.athlete_groups g on g.athlete_id = s.athlete_id
     where s.athlete_id = '44000000-0000-4000-8000-0000000000e2' $$,
  $$ values ('44000000-0000-4000-8000-0000000000b1'::uuid, '44000000-0000-4000-8000-0000000000c1'::uuid,
             '44000000-0000-4000-8000-0000000000d1'::uuid) $$,
  'the adult athlete is linked to the invitation school and group'
);
select is(
  (select count(*) from public.athlete_schools where athlete_id = '44000000-0000-4000-8000-0000000000e7'),
  0::bigint,
  'refused calls for e7 write no school link'
);
select is(
  (select count(*) from public.athlete_groups where athlete_id = '44000000-0000-4000-8000-0000000000e7'),
  0::bigint,
  'refused calls for e7 write no group link'
);
select is(
  (select count(*) from public.athlete_schools where athlete_id = '44000000-0000-4000-8000-0000000000e4')
  + (select count(*) from public.athlete_groups where athlete_id = '44000000-0000-4000-8000-0000000000e4'),
  0::bigint,
  'the athlete with no manager gets no link'
);
select results_eq(
  $$ select school_id from public.athlete_schools where athlete_id = '44000000-0000-4000-8000-0000000000e3' $$,
  $$ values ('44000000-0000-4000-8000-0000000000b2'::uuid) $$,
  'the athlete of another guardian keeps only their own school'
);
select results_eq(
  $$ select group_id from public.athlete_groups where athlete_id = '44000000-0000-4000-8000-0000000000e3' $$,
  $$ values ('44000000-0000-4000-8000-0000000000d2'::uuid) $$,
  'the athlete of another guardian keeps only their own group'
);
select is(
  (select category_id from public.athlete_schools
   where athlete_id = '44000000-0000-4000-8000-0000000000e5' and school_id = '44000000-0000-4000-8000-0000000000b1'),
  '44000000-0000-4000-8000-0000000000c2'::uuid,
  'an existing school link keeps the category the school set'
);
select is(
  (select count(*) from public.athlete_schools where athlete_id = '44000000-0000-4000-8000-0000000000e5'),
  1::bigint,
  'an existing school link is not duplicated'
);
select is(
  (select count(*) from public.athlete_groups
   where athlete_id = '44000000-0000-4000-8000-0000000000e5' and group_id = '44000000-0000-4000-8000-0000000000d1'),
  1::bigint,
  'the missing group link is added to an athlete already in the school'
);
select is(
  (select count(*) from public.athlete_schools where school_id = '44000000-0000-4000-8000-0000000000b2'),
  1::bigint,
  'school two gains no athlete'
);
select is(
  (select count(*) from public.athlete_schools
   where athlete_id::text like '44000000-%'),
  5::bigint,
  'only the accepted athletes are linked to a school'
);
select is(
  (select count(*) from public.athlete_groups
   where athlete_id::text like '44000000-%'),
  5::bigint,
  'only the accepted athletes are linked to a group'
);

-- The authorizations written
select results_eq(
  $$ select user_id, purpose, text_id, accepted_at from public.authorizations
     where athlete_id = '44000000-0000-4000-8000-0000000000e1' order by purpose $$,
  $$ select '44000000-0000-4000-8000-0000000000a1'::uuid, p, pg_temp.text_of(p), pg_temp.at()
     from unnest(array['import_official_results', 'record_times', 'share_results_with_school']) as p order by p $$,
  'the athlete has exactly the three authorizations, by the caller, with the device time and the text sent, even after a retry'
);
select is(
  (select count(*) from public.authorizations where athlete_id = '44000000-0000-4000-8000-0000000000e1' and received_at is not null and withdrawn_at is null),
  3::bigint,
  'each authorization has its server reception time and none is withdrawn'
);
select is(
  (select count(*) from public.authorization_status where athlete_id = '44000000-0000-4000-8000-0000000000e1' and is_granted),
  3::bigint,
  'the three purposes are granted in the status of the athlete'
);
select is(
  (select count(*) from public.authorizations where athlete_id = '44000000-0000-4000-8000-0000000000e7'),
  0::bigint,
  'the refused calls for e7 write no authorization'
);
select is(
  (select count(*) from public.authorizations where athlete_id::text like '44000000-%' and user_id = '44000000-0000-4000-8000-0000000000a2'),
  3::bigint,
  'the adult athlete accepted three authorizations for themselves'
);
select is(
  (select count(*) from public.authorizations where athlete_id::text like '44000000-%'),
  12::bigint,
  'only the four accepted athletes have authorizations, three each'
);

-- The fixtures are written as the owner, with no signed-in user.
select set_config('request.jwt.claims', '', true);
-- Joining gives the school what recording needs: a coach of the athlete records a plan fulfillment (it needs record_times)
-- of e1, who joined, and not of e8, who never accepted. Coach K is assigned to both.
insert into auth.users (id, email) values ('44000000-0000-4000-8000-0000000000a5', 'coach-k@example.test');
insert into public.school_memberships (school_id, user_id, role) values
  ('44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-0000000000a5', 'coach');
insert into public.athletes (id, first_name, last_name) values ('44000000-0000-4000-8000-0000000000e8', 'Athlete', 'E8');
insert into public.athlete_schools (athlete_id, school_id) values
  ('44000000-0000-4000-8000-0000000000e8', '44000000-0000-4000-8000-0000000000b1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('44000000-0000-4000-8000-0000000000a5', '44000000-0000-4000-8000-0000000000e1', '44000000-0000-4000-8000-0000000000b1'),
  ('44000000-0000-4000-8000-0000000000a5', '44000000-0000-4000-8000-0000000000e8', '44000000-0000-4000-8000-0000000000b1');
insert into public.training_plans (id, created_by, school_id, name) values
  ('44000000-0000-4000-8000-000000000301', '44000000-0000-4000-8000-0000000000a4', '44000000-0000-4000-8000-0000000000b1', 'Plan');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('44000000-0000-4000-8000-000000000302', '44000000-0000-4000-8000-0000000000a4', '44000000-0000-4000-8000-000000000301', 1);
insert into public.training_plan_blocks (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('44000000-0000-4000-8000-000000000303', '44000000-0000-4000-8000-0000000000a4', '44000000-0000-4000-8000-000000000302', 1, 4, '50m', 'FR', 'warm_up', 'completion');
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target) values
  ('44000000-0000-4000-8000-000000000304', '44000000-0000-4000-8000-0000000000a4', '44000000-0000-4000-8000-0000000000b1',
   '44000000-0000-4000-8000-000000000301', '44000000-0000-4000-8000-000000000302', '2026-11-02', 'school');

set local role authenticated;
set local request.jwt.claims = '{"sub": "44000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, created_by, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('44000000-0000-4000-8000-000000000311', '44000000-0000-4000-8000-0000000000a5', 'dev-k',
             '44000000-0000-4000-8000-000000000304', '44000000-0000-4000-8000-000000000302', '44000000-0000-4000-8000-000000000303',
             '44000000-0000-4000-8000-0000000000e8', '2026-11-02 08:00:00+00') $$,
  '42501', null,
  'the coach cannot record for an athlete who never accepted record_times'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, created_by, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('44000000-0000-4000-8000-000000000312', '44000000-0000-4000-8000-0000000000a5', 'dev-k',
             '44000000-0000-4000-8000-000000000304', '44000000-0000-4000-8000-000000000302', '44000000-0000-4000-8000-000000000303',
             '44000000-0000-4000-8000-0000000000e1', '2026-11-02 08:00:00+00') $$,
  'the coach records for the athlete who joined the school'
);
-- A measurement (a time) of the athlete who joined. Its insert policy asks for the coach's charge, not for record_times: what
-- record_times changes is that the time stays visible (hidden only follows a withdrawal), so the control for the refusal is the
-- fulfillment above, which does ask for record_times.
select lives_ok(
  $$ insert into public.measurements (school_id, id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values ('44000000-0000-4000-8000-0000000000b1', '44000000-0000-4000-8000-000000000321', 'repetition', '44000000-0000-4000-8000-0000000000e1',
             3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 08:05:00+00') $$,
  'the coach records a time of the athlete who joined the school'
);
select is(
  (select count(*) from public.measurements where id = '44000000-0000-4000-8000-000000000321' and not hidden),
  1::bigint,
  'the coach reads that time back, not hidden: the school can see and edit what it records'
);
reset role;

select * from finish();
rollback;
