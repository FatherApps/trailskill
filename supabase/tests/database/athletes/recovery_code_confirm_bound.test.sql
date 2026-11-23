-- confirm_athlete_recovery_codes(athlete, main_code) (issue #1417): the confirmation names the set the owner saved, so a late or
-- stale confirmation never confirms a set the person did not see. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('14170000-0000-4000-8000-0000000000a1', 'rcb-guardian@example.test'),
  ('14170000-0000-4000-8000-0000000000a2', 'rcb-stranger@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('14170000-0000-4000-8000-0000000000e1', 'Athlete', 'One'),
  ('14170000-0000-4000-8000-0000000000e2', 'Athlete', 'Two'),
  ('14170000-0000-4000-8000-0000000000e3', 'Athlete', 'Three');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('14170000-0000-4000-8000-0000000000a1', '14170000-0000-4000-8000-0000000000e1', 'guardian'),
  ('14170000-0000-4000-8000-0000000000a1', '14170000-0000-4000-8000-0000000000e2', 'guardian'),
  ('14170000-0000-4000-8000-0000000000a1', '14170000-0000-4000-8000-0000000000e3', 'guardian');

set local role authenticated;
set local request.jwt.claims = '{"sub": "14170000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- e1: issue, then confirm with a wrong code, then with the issued one.
select set_config('rcb.main1', (select main_code from public.issue_athlete_recovery_code('14170000-0000-4000-8000-0000000000e1')), true);
select ok(current_setting('rcb.main1') like 'TR-%', 'the first call issues a permanent code');
select throws_ok(
  $$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e1', 'TR-AAAA-AAAA-AAAA-AAAA')$$,
  'P0001', 'recovery_set_superseded', 'a confirmation with another code is refused as superseded'
);
reset role;
select is((select confirmed_at is null from public.athlete_recovery_identities where athlete_id = '14170000-0000-4000-8000-0000000000e1'),
  true, 'and nothing was confirmed');
set local role authenticated;
set local request.jwt.claims = '{"sub": "14170000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e1', current_setting('rcb.main1'))$$,
  'the issued code confirms its set');
reset role;
select is((select confirmed_at is not null from public.athlete_recovery_identities where athlete_id = '14170000-0000-4000-8000-0000000000e1'),
  true, 'which is now confirmed');
set local role authenticated;
set local request.jwt.claims = '{"sub": "14170000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e1', lower(replace(current_setting('rcb.main1'), '-', ' ')))$$,
  'confirming again is harmless, and the code may be typed in any case without dashes');

-- e2: a second call before the confirmation replaces the set, so the first code is superseded.
select set_config('rcb.old', (select main_code from public.issue_athlete_recovery_code('14170000-0000-4000-8000-0000000000e2')), true);
select set_config('rcb.new', (select main_code from public.issue_athlete_recovery_code('14170000-0000-4000-8000-0000000000e2')), true);
select isnt(current_setting('rcb.old'), current_setting('rcb.new'), 'a second call before confirming replaces the set');
select throws_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e2', current_setting('rcb.old'))$$,
  'P0001', 'recovery_set_superseded', 'the replaced code can no longer confirm');
select lives_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e2', current_setting('rcb.new'))$$,
  'the current code confirms');

-- e3: no codes yet.
select throws_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e3', 'TR-AAAA-AAAA-AAAA-AAAA')$$,
  'P0001', 'no_recovery_identity', 'a swimmer without codes has nothing to confirm');

-- Not who manages the swimmer, and not signed in.
set local request.jwt.claims = '{"sub": "14170000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e1', 'TR-AAAA-AAAA-AAAA-AAAA')$$,
  '42501', null, 'a stranger cannot confirm');
reset role;
set local role anon;
select throws_ok($$select public.confirm_athlete_recovery_codes('14170000-0000-4000-8000-0000000000e1', 'TR-AAAA-AAAA-AAAA-AAAA')$$,
  '42501', null, 'nor a signed-out caller');

select * from finish();
rollback;
