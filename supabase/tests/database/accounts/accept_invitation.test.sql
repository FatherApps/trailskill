-- Accepting a school invitation (issue #44): a guardian or an adult athlete
-- links one of their own athletes to the invitation's school and group, and
-- nothing else. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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
   from pg_proc where oid = 'public.accept_invitation(text, uuid, uuid)'::regprocedure),
  'accept_invitation is security definer with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.accept_invitation(text, uuid, uuid)', 'execute'),
  'anon cannot execute accept_invitation'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_invitation(text, uuid, uuid)', 'execute'),
  'authenticated can execute accept_invitation'
);

-- No session
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', null) $$,
  '42501', null,
  'a call without a signed-in user is refused'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "44000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', '44000000-0000-4000-8000-0000000000c1') $$,
  'a guardian accepts for their own athlete with a category'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e6', null) $$,
  'a guardian accepts without a category'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', '44000000-0000-4000-8000-0000000000c3') $$,
  '22023', null,
  'a category of another school is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e7', '44000000-0000-4000-8000-0000000000c4') $$,
  '23514', null,
  'an inactive category is refused by the existing trigger'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e3', null) $$,
  '42501', null,
  'an athlete managed by someone else is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e4', null) $$,
  '42501', null,
  'an athlete with no manager is refused'
);
select throws_ok(
  $$ select public.accept_invitation('no-such-token-0123456789abcdef0123456', '44000000-0000-4000-8000-0000000000e3', null) $$,
  '42501', null,
  'the athlete is checked before the token'
);
select throws_ok(
  $$ select public.accept_invitation('no-such-token-0123456789abcdef0123456', '44000000-0000-4000-8000-0000000000e7', null) $$,
  'P0002', 'invitation not found',
  'an unknown token is refused'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.expired'), '44000000-0000-4000-8000-0000000000e7', null) $$,
  'P0002', 'invitation not found',
  'an expired token is refused like an unknown one'
);
select throws_ok(
  $$ select public.accept_invitation(current_setting('test.revoked'), '44000000-0000-4000-8000-0000000000e7', null) $$,
  'P0002', 'invitation not found',
  'a revoked token is refused like an unknown one'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e1', '44000000-0000-4000-8000-0000000000c1') $$,
  'accepting the same invitation twice raises no error'
);
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e5', '44000000-0000-4000-8000-0000000000c1') $$,
  'a guardian accepts for an athlete already in the school'
);

-- Adult athlete A
set local request.jwt.claims = '{"sub": "44000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.accept_invitation(current_setting('test.valid'), '44000000-0000-4000-8000-0000000000e2', '44000000-0000-4000-8000-0000000000c1') $$,
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

select * from finish();
rollback;
