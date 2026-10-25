-- Creating a managed athlete (issue #42): a guardian or an adult athlete creates
-- an athlete profile and its manager link in one call to
-- public.create_managed_athlete, because the tables themselves stay closed to
-- them. The call is idempotent (a re-send answers 'stored' or 'changed'), never
-- trusts a user id from the payload and leaves nothing behind when it fails.
-- All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Users: guardian G, guardian X (another family) and adult athlete A.
insert into auth.users (id, email) values
  ('71000000-0000-4000-8000-0000000000a1', 'guardian-g@example.test'),
  ('71000000-0000-4000-8000-0000000000a2', 'guardian-x@example.test'),
  ('71000000-0000-4000-8000-0000000000a3', 'adult-a@example.test');

select ok(
  not has_function_privilege('anon', 'public.create_managed_athlete(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.create_managed_athlete(jsonb)', 'execute'),
  'only signed-in users can call create_managed_athlete'
);

set local role authenticated;

-- What the device sends: the athlete row and the manager row it wrote locally.
create function pg_temp.sent(athlete uuid, manager uuid, first text, relation text default 'guardian', manager_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'athlete', jsonb_build_object('id', athlete, 'first_name', first, 'last_name', 'Lopez'),
    'manager', jsonb_build_object('id', manager, 'athlete_id', athlete, 'relation', relation) || manager_extra
  )
$$;

set local request.jwt.claims = '{"sub": "71000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.athletes (id, first_name, last_name) values ('71000000-0000-4000-8000-0000000000e9', 'Direct', 'Insert') $$,
  '42501',
  null,
  'a guardian still cannot insert into athletes directly'
);
select throws_ok(
  $$ insert into public.athlete_managers (user_id, athlete_id, relation)
     values ('71000000-0000-4000-8000-0000000000a1', '71000000-0000-4000-8000-0000000000e9', 'guardian') $$,
  '42501',
  null,
  'a guardian still cannot insert into athlete_managers directly'
);

-- Two children; the second payload also carries the guardian's own user id, as the device writes it.
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', 'Ana')),
  'stored',
  'the guardian creates the first child'
);
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e2', '71000000-0000-4000-8000-0000000000f2', 'Beto', 'guardian',
    '{"user_id": "71000000-0000-4000-8000-0000000000a1"}')),
  'stored',
  'the guardian creates a second child sending its own user id'
);
select is(
  (select count(*) from public.athlete_managers
   where user_id = '71000000-0000-4000-8000-0000000000a1' and relation = 'guardian' and created_by = '71000000-0000-4000-8000-0000000000a1'),
  2::bigint,
  'both links are visible to the guardian, as guardian links created by the guardian'
);
select is(
  (select count(*) from public.athletes where created_by = '71000000-0000-4000-8000-0000000000a1'),
  2::bigint,
  'both athletes are visible to the guardian and created by the guardian'
);

-- Re-sends.
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', 'Ana')),
  'stored',
  'an identical re-send is stored'
);
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', 'Anita')),
  'changed',
  'a re-send with another name is changed'
);
select is(
  (select first_name from public.athletes where id = '71000000-0000-4000-8000-0000000000e1'),
  'Ana',
  'a changed re-send leaves the stored name untouched'
);
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', 'Ana', 'self')),
  'changed',
  'a re-send with another relation is changed'
);
select is(
  (select relation from public.athlete_managers where id = '71000000-0000-4000-8000-0000000000f1'),
  'guardian',
  'a changed re-send leaves the stored relation untouched'
);
select is(
  (select count(*) from public.athlete_managers where athlete_id = '71000000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'a re-send adds no link'
);

-- Rejections.
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', 'Carla', 'guardian',
       '{"user_id": "71000000-0000-4000-8000-0000000000a2"}')) $$,
  '42501',
  null,
  'a link for another user id is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f4', 'Ana')) $$,
  '42501',
  null,
  'an existing athlete with another manager id is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', 'Carla', 'coach')) $$,
  '22023',
  null,
  'a relation other than guardian or self is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', '   ')) $$,
  '22023',
  null,
  'a blank first name is refused'
);
select throws_ok(
  format($$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', %L)) $$, repeat('a', 101)),
  '22023',
  null,
  'a first name of 101 characters is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(jsonb_set(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', 'Carla'),
       '{athlete,last_name}', to_jsonb(repeat('b', 101)))) $$,
  '22023',
  null,
  'a last name of 101 characters is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', 'Carla', 'guardian',
       '{"athlete_id": "71000000-0000-4000-8000-0000000000e1"}')) $$,
  '22023',
  null,
  'a manager row for another athlete than the one sent is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete('{"athlete": null, "manager": null}') $$,
  '22023',
  null,
  'a payload without athlete and manager is refused'
);

select is(
  public.create_managed_athlete(jsonb_set(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000ea', '71000000-0000-4000-8000-0000000000fa', repeat('a', 100)),
    '{athlete,last_name}', to_jsonb(repeat('b', 100)))),
  'stored',
  'names of exactly 100 characters are accepted'
);

-- Guardian X cannot take over or replay what G created.
set local request.jwt.claims = '{"sub": "71000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', 'Ana')) $$,
  '42501',
  null,
  'another user replaying the guardian''s creation is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e5', '71000000-0000-4000-8000-0000000000f1', 'Ana')) $$,
  '42501',
  null,
  'a new athlete linked with the manager id of another user is refused'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f5', 'Ana')) $$,
  '42501',
  null,
  'a new manager id on an athlete of another user is refused'
);

-- An adult athlete creates their own profile, once.
set local request.jwt.claims = '{"sub": "71000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e6', '71000000-0000-4000-8000-0000000000f6', 'Adulto', 'self')),
  'stored',
  'an adult creates their own profile'
);
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e7', '71000000-0000-4000-8000-0000000000f7', 'Otro', 'self')) $$,
  '23505',
  null,
  'a second self profile for the same user is refused'
);
select is(
  (select count(*) from public.athletes),
  1::bigint,
  'the adult sees only their own profile'
);

set local request.jwt.claims = '{"sub": "71000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  public.create_managed_athlete(pg_temp.sent(
    '71000000-0000-4000-8000-0000000000e8', '71000000-0000-4000-8000-0000000000f8', 'Dani', 'guardian')),
  'stored',
  'a guardian can still add a child after the rejections'
);

reset role;
select is(
  (select count(*) from public.athletes
   where id in ('71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000e5', '71000000-0000-4000-8000-0000000000e7')),
  0::bigint,
  'no rejected call leaves an athlete behind'
);
select is(
  (select count(*) from public.athlete_managers
   where id in ('71000000-0000-4000-8000-0000000000f3', '71000000-0000-4000-8000-0000000000f4',
                '71000000-0000-4000-8000-0000000000f5', '71000000-0000-4000-8000-0000000000f7')),
  0::bigint,
  'no rejected call leaves a link behind'
);

-- Signed out.
set local role anon;
select throws_ok(
  $$ select public.create_managed_athlete(pg_temp.sent(
       '71000000-0000-4000-8000-0000000000e3', '71000000-0000-4000-8000-0000000000f3', 'Carla')) $$,
  '42501',
  null,
  'a call without a session is refused'
);

select * from finish();
rollback;
