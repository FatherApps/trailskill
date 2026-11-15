-- Which imported official result goes with a competition time (issue #974): the owner records the choice on their own time,
-- nobody else can. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('97400000-0000-4000-8000-0000000000a1', 'guardian-one@example.test'),
  ('97400000-0000-4000-8000-0000000000a2', 'guardian-two@example.test');
insert into public.athletes (id, first_name, last_name) values ('97400000-0000-4000-8000-0000000000e1', 'Athlete', 'F1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('97400000-0000-4000-8000-0000000000a1', '97400000-0000-4000-8000-0000000000e1', 'guardian');
insert into public.family_timing_measurements (id, owner_user_id, captured_by, athlete_id, stroke, distance, pool, session_type, captured_at, millis)
values ('97400000-0000-4000-8000-0000000000f1', '97400000-0000-4000-8000-0000000000a1', '97400000-0000-4000-8000-0000000000a1',
        '97400000-0000-4000-8000-0000000000e1', 'FL', '50m', 'SCM', 'competition', '2026-11-08T12:00:00Z', 42950);

select has_column('public', 'family_timing_measurements', 'official_result_key', 'a time can remember its chosen official result');

set local role authenticated;
set local request.jwt.claims = '{"sub": "97400000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.family_timing_measurements set official_result_key = 'provider-a:final'
     where id = '97400000-0000-4000-8000-0000000000f1' $$,
  'the owner records which official result goes with the time'
);
select is((select official_result_key from public.family_timing_measurements where id = '97400000-0000-4000-8000-0000000000f1'),
  'provider-a:final', 'the choice is kept');
select is((select millis from public.family_timing_measurements where id = '97400000-0000-4000-8000-0000000000f1'), 42950,
  'the captured time stays the same');

set local request.jwt.claims = '{"sub": "97400000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
update public.family_timing_measurements set official_result_key = 'provider-a:heat' where id = '97400000-0000-4000-8000-0000000000f1';
reset role;
select is((select official_result_key from public.family_timing_measurements where id = '97400000-0000-4000-8000-0000000000f1'),
  'provider-a:final', 'nobody else changes it');

select * from finish();
rollback;
