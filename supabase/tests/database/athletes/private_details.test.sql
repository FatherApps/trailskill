-- Birth date and gender of a swimmer (issue #1366): only whoever manages the swimmer (a guardian, or the adult athlete themself)
-- and a platform admin read and write them. Another guardian, the coach, the school admin, a stranger and anon do not. The values are
-- checked on the server, a marked account writes nothing, and the columns are not on athletes (which staff read whole).
-- All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- Users: guardian G, adult athlete X (relation 'self'), guardian G2 of another swimmer, coach A, school admin S, stranger N,
-- platform admin P, guardian M whose account is marked for deletion.
insert into auth.users (id, email) values
  ('13660000-0000-4000-8000-0000000000a1', 'pd-coach-a@example.test'),
  ('13660000-0000-4000-8000-0000000000a2', 'pd-guardian-g@example.test'),
  ('13660000-0000-4000-8000-0000000000a3', 'pd-adult-x@example.test'),
  ('13660000-0000-4000-8000-0000000000a4', 'pd-admin-s@example.test'),
  ('13660000-0000-4000-8000-0000000000a5', 'pd-stranger-n@example.test'),
  ('13660000-0000-4000-8000-0000000000a6', 'pd-guardian-g2@example.test'),
  ('13660000-0000-4000-8000-0000000000a7', 'pd-platform-p@example.test'),
  ('13660000-0000-4000-8000-0000000000a8', 'pd-guardian-m@example.test');

insert into public.platform_admins (user_id) values ('13660000-0000-4000-8000-0000000000a7');
insert into public.schools (id, name) values ('13660000-0000-4000-8000-0000000000b1', 'Details School One');
insert into public.training_groups (id, school_id, name)
values ('13660000-0000-4000-8000-0000000000d1', '13660000-0000-4000-8000-0000000000b1', 'Details Group One');
insert into public.school_memberships (school_id, user_id, role) values
  ('13660000-0000-4000-8000-0000000000b1', '13660000-0000-4000-8000-0000000000a1', 'coach'),
  ('13660000-0000-4000-8000-0000000000b1', '13660000-0000-4000-8000-0000000000a4', 'school_admin');
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('13660000-0000-4000-8000-0000000000a1', '13660000-0000-4000-8000-0000000000d1');

-- e1: G's. e2: the adult athlete X. e3: G2's. e5: M's (marked account). e1, e2 and e3 are in the school and in its group.
insert into public.athletes (id, first_name, last_name) values
  ('13660000-0000-4000-8000-0000000000e1', 'Athlete', 'One'),
  ('13660000-0000-4000-8000-0000000000e2', 'Athlete', 'Two'),
  ('13660000-0000-4000-8000-0000000000e3', 'Athlete', 'Three'),
  ('13660000-0000-4000-8000-0000000000e5', 'Athlete', 'Five');
insert into public.athlete_schools (athlete_id, school_id) values
  ('13660000-0000-4000-8000-0000000000e1', '13660000-0000-4000-8000-0000000000b1'),
  ('13660000-0000-4000-8000-0000000000e2', '13660000-0000-4000-8000-0000000000b1'),
  ('13660000-0000-4000-8000-0000000000e3', '13660000-0000-4000-8000-0000000000b1');
insert into public.athlete_groups (athlete_id, group_id) values
  ('13660000-0000-4000-8000-0000000000e1', '13660000-0000-4000-8000-0000000000d1'),
  ('13660000-0000-4000-8000-0000000000e3', '13660000-0000-4000-8000-0000000000d1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('13660000-0000-4000-8000-0000000000a2', '13660000-0000-4000-8000-0000000000e1', 'guardian'),
  ('13660000-0000-4000-8000-0000000000a3', '13660000-0000-4000-8000-0000000000e2', 'self'),
  ('13660000-0000-4000-8000-0000000000a6', '13660000-0000-4000-8000-0000000000e3', 'guardian'),
  ('13660000-0000-4000-8000-0000000000a8', '13660000-0000-4000-8000-0000000000e5', 'guardian');
-- G2's swimmer already has details (inserted by the owner, as a test fixture).
insert into public.athlete_private_details (athlete_id, birth_date, gender)
values ('13660000-0000-4000-8000-0000000000e3', '2011-01-02', 'M'),
  ('13660000-0000-4000-8000-0000000000e5', null, 'F');

-- G: saves and reads the details of their swimmer; cannot write the details of G2's swimmer.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$insert into public.athlete_private_details (athlete_id, birth_date, gender) values ('13660000-0000-4000-8000-0000000000e1', '2012-03-04', 'F')$$,
  'a guardian saves the birth date and gender of their swimmer'
);
select is(
  (select birth_date::text || ' ' || gender from public.athlete_private_details where athlete_id = '13660000-0000-4000-8000-0000000000e1'),
  '2012-03-04 F',
  'and reads them back'
);
select lives_ok(
  $$update public.athlete_private_details set gender = 'undisclosed', birth_date = '2012-03-05' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  'and changes them'
);
select is(
  (select gender from public.athlete_private_details where athlete_id = '13660000-0000-4000-8000-0000000000e1'),
  'undisclosed',
  'the change is stored'
);
select lives_ok(
  $$update public.athlete_private_details set gender = null, birth_date = null where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  'both can be left unanswered (null)'
);
select throws_ok(
  $$insert into public.athlete_private_details (athlete_id, gender) values ('13660000-0000-4000-8000-0000000000e3', 'F')$$,
  '42501', null, 'a guardian cannot insert details for the swimmer of another guardian'
);
select is(
  (select count(*) from public.athlete_private_details where athlete_id = '13660000-0000-4000-8000-0000000000e3'),
  0::bigint,
  'nor read them'
);
select lives_ok(
  $$update public.athlete_private_details set gender = 'F' where athlete_id = '13660000-0000-4000-8000-0000000000e3'$$,
  'an update of the details of another swimmer is filtered, not an error'
);
select lives_ok(
  $$delete from public.athlete_private_details where athlete_id = '13660000-0000-4000-8000-0000000000e3'$$,
  'and so is a delete'
);
select throws_ok(
  $$insert into public.athlete_private_details (athlete_id, gender) values ('13660000-0000-4000-8000-0000000000e1', 'F')$$,
  '23505', null, 'one row per swimmer: a second insert is a unique violation'
);
select throws_ok(
  $$update public.athlete_private_details set athlete_id = '13660000-0000-4000-8000-0000000000e3' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  '42501', null, 'a row cannot be moved to another swimmer'
);
-- Values rejected by the server.
select throws_ok(
  format($$update public.athlete_private_details set birth_date = %L where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$, (current_date + 1)::text),
  '23514', null, 'a birth date in the future is rejected'
);
select lives_ok(
  format($$update public.athlete_private_details set birth_date = %L where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$, current_date::text),
  'a birth date of today is accepted'
);
select throws_ok(
  $$update public.athlete_private_details set birth_date = '1899-12-31' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'a birth date before 1900-01-01 is rejected'
);
select lives_ok(
  $$update public.athlete_private_details set birth_date = '1900-01-01' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  'the lower bound itself is accepted'
);
select throws_ok(
  $$update public.athlete_private_details set gender = 'X' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'a gender outside null, F, M and undisclosed is rejected'
);
select throws_ok(
  $$update public.athlete_private_details set gender = 'f' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'the values are case sensitive'
);
select throws_ok(
  $$update public.athlete_private_details set gender = '' where athlete_id = '13660000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'an empty gender is rejected (null is how it is left unanswered)'
);
reset role;

-- G2's row was neither changed nor deleted by the filtered statements above.
select is(
  (select gender from public.athlete_private_details where athlete_id = '13660000-0000-4000-8000-0000000000e3'),
  'M',
  'the filtered update and delete left the row of the other guardian alone'
);

-- X: the adult athlete (relation 'self') saves their own.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$insert into public.athlete_private_details (athlete_id, birth_date, gender) values ('13660000-0000-4000-8000-0000000000e2', '1995-06-07', 'M')$$,
  'the adult athlete saves their own birth date and gender'
);
select is(
  (select count(*) from public.athlete_private_details),
  1::bigint,
  'and reads only their own row'
);
reset role;

-- G2 reads the row the fixture gave them, and nobody else's. Another guardian does not see G's.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(
  (select array_agg(athlete_id::text) from public.athlete_private_details),
  array['13660000-0000-4000-8000-0000000000e3'],
  'another guardian reads only the details of their own swimmer'
);
reset role;

-- The coach, the school admin and a stranger read and write nothing, though they see the athletes of the school.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is((select count(*) from public.athletes where id = '13660000-0000-4000-8000-0000000000e1'), 1::bigint, 'the coach does see the swimmer row');
select is((select count(*) from public.athlete_private_details), 0::bigint, 'but not the birth date or the gender (coach)');
select throws_ok(
  $$insert into public.athlete_private_details (athlete_id, gender) values ('13660000-0000-4000-8000-0000000000e3', 'F')$$,
  '42501', null, 'a coach cannot write details of a swimmer of their own group'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is((select count(*) from public.athletes where id = '13660000-0000-4000-8000-0000000000e1'), 1::bigint, 'the school admin does see the swimmer row');
select is((select count(*) from public.athlete_private_details), 0::bigint, 'but not the birth date or the gender (school admin)');
select throws_ok(
  $$insert into public.athlete_private_details (athlete_id, gender) values ('13660000-0000-4000-8000-0000000000e3', 'F')$$,
  '42501', null, 'a school admin cannot write details of a swimmer of their school'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is((select count(*) from public.athlete_private_details), 0::bigint, 'a stranger reads nothing');
reset role;

-- anon is denied by the grants.
set local role anon;
select throws_ok(
  $$select * from public.athlete_private_details$$,
  '42501', null, 'anon cannot read the table'
);
select throws_ok(
  $$insert into public.athlete_private_details (athlete_id, gender) values ('13660000-0000-4000-8000-0000000000e5', 'F')$$,
  '42501', null, 'anon cannot write the table'
);
reset role;

-- The platform admin reads and writes any row.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is((select count(*) from public.athlete_private_details), 4::bigint, 'a platform admin reads every row');
select lives_ok(
  $$update public.athlete_private_details set gender = 'undisclosed' where athlete_id = '13660000-0000-4000-8000-0000000000e3'$$,
  'and writes any row'
);
select throws_ok(
  $$update public.athlete_private_details set athlete_id = '13660000-0000-4000-8000-0000000000e5' where athlete_id = '13660000-0000-4000-8000-0000000000e3'$$,
  '42501', 'athlete private details keep their athlete', 'even a platform admin cannot move a row to another swimmer (the trigger, not the policy)'
);
reset role;

-- Offline: the query of the stream athletes_private_details, run as the stream runs it (no RLS), for each user. It is a copy of
-- powersync/sync-config.yaml (athletes_private_details with the set managed_athlete_ids): src/modules/athletes/__tests__/
-- privateDetailsSyncStream.test.ts pins both texts, so change them together. Guardians and the adult athlete get the rows of
-- the swimmers they manage; the coach, the school admin, the stranger and the platform admin get nothing.
create function pg_temp.stream_details(uuid) returns table (athlete_id uuid) language sql as $$
  select d.athlete_id from public.athlete_private_details d
    where d.athlete_id in (select m.athlete_id from public.athlete_managers m where m.user_id = $1
      and $1 in (select s.user_id from public.account_sync_access s where s.user_id = $1)) $$;
select is((select array_agg(athlete_id::text) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a2')), array['13660000-0000-4000-8000-0000000000e1'], 'the stream gives the guardian the details of their swimmer');
select is((select array_agg(athlete_id::text) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a3')), array['13660000-0000-4000-8000-0000000000e2'], 'the stream gives the adult athlete their own details');
select is((select array_agg(athlete_id::text) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a6')), array['13660000-0000-4000-8000-0000000000e3'], 'the stream gives the other guardian only their own swimmer');
select is((select count(*) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a1')), 0::bigint, 'the stream gives the coach no row, though the coach sees the swimmers of the group');
select is((select count(*) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a4')), 0::bigint, 'the stream gives the school admin no row, though the admin sees the swimmers of the school');
select is((select count(*) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a5')), 0::bigint, 'the stream gives a stranger no row');
select is((select count(*) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a7')), 0::bigint, 'and no stream gives the platform admin a row (online support)');

-- M: a guardian whose account is marked for deletion is refused by the marked-account guard.
insert into public.account_deletion_requests (user_id, email, delete_after)
values ('13660000-0000-4000-8000-0000000000a8', 'pd-guardian-m@example.test', now() + interval '30 days');
set local role authenticated;
set local request.jwt.claims = '{"sub": "13660000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select throws_ok(
  $$insert into public.athlete_private_details (athlete_id, gender) values ('13660000-0000-4000-8000-0000000000e5', 'F')$$,
  '42501', 'the account is marked for deletion', 'a marked account cannot save details'
);
reset role;
-- A marked account syncs nothing (the gate of account_sync_access), even for a swimmer that has details (e5, fixture above).
select is((select count(*) from pg_temp.stream_details('13660000-0000-4000-8000-0000000000a8')), 0::bigint, 'the stream gives a marked account nothing');

-- The columns are not on athletes, which the staff read whole, and the table is in the sync publication.
select hasnt_column('public', 'athletes', 'birth_date', 'athletes has no birth_date');
select hasnt_column('public', 'athletes', 'gender', 'athletes has no gender');
select is(
  (select count(*) from pg_catalog.pg_publication_tables where pubname = 'powersync' and schemaname = 'public' and tablename = 'athlete_private_details'),
  1::bigint,
  'the table is in the powersync publication'
);

select * from finish();
rollback;
