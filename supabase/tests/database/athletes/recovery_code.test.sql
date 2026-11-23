-- Permanent recovery code and single-use recovery codes of a swimmer (issue #1416): only whoever manages the swimmer issues and
-- regenerates them, the server keeps only hashes, a recovery code works once, and failed redeem attempts are limited.
-- All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(109);

-- Users: guardian G (owns e1), adult athlete X (owns e2, relation 'self'), guardian G2 (owns e3), coach A, school admin S, stranger N,
-- platform admin P.
insert into auth.users (id, email) values
  ('14160000-0000-4000-8000-0000000000a1', 'rc-coach-a@example.test'),
  ('14160000-0000-4000-8000-0000000000a2', 'rc-guardian-g@example.test'),
  ('14160000-0000-4000-8000-0000000000a3', 'rc-adult-x@example.test'),
  ('14160000-0000-4000-8000-0000000000a4', 'rc-admin-s@example.test'),
  ('14160000-0000-4000-8000-0000000000a5', 'rc-stranger-n@example.test'),
  ('14160000-0000-4000-8000-0000000000a6', 'rc-guardian-g2@example.test'),
  ('14160000-0000-4000-8000-0000000000a7', 'rc-platform-p@example.test');

insert into public.platform_admins (user_id) values ('14160000-0000-4000-8000-0000000000a7');
insert into public.schools (id, name) values ('14160000-0000-4000-8000-0000000000b1', 'Recovery School One');
insert into public.training_groups (id, school_id, name)
values ('14160000-0000-4000-8000-0000000000d1', '14160000-0000-4000-8000-0000000000b1', 'Recovery Group One');
insert into public.school_memberships (school_id, user_id, role) values
  ('14160000-0000-4000-8000-0000000000b1', '14160000-0000-4000-8000-0000000000a1', 'coach'),
  ('14160000-0000-4000-8000-0000000000b1', '14160000-0000-4000-8000-0000000000a4', 'school_admin');
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('14160000-0000-4000-8000-0000000000a1', '14160000-0000-4000-8000-0000000000d1');
insert into public.athletes (id, first_name, last_name) values
  ('14160000-0000-4000-8000-0000000000e1', 'Athlete', 'One'),
  ('14160000-0000-4000-8000-0000000000e2', 'Athlete', 'Two'),
  ('14160000-0000-4000-8000-0000000000e3', 'Athlete', 'Three'),
  ('14160000-0000-4000-8000-0000000000e4', 'Athlete', 'Four'),
  ('14160000-0000-4000-8000-0000000000e5', 'Athlete', 'Five');
insert into public.athlete_schools (athlete_id, school_id) values
  ('14160000-0000-4000-8000-0000000000e1', '14160000-0000-4000-8000-0000000000b1');
insert into public.athlete_groups (athlete_id, group_id) values
  ('14160000-0000-4000-8000-0000000000e1', '14160000-0000-4000-8000-0000000000d1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('14160000-0000-4000-8000-0000000000a2', '14160000-0000-4000-8000-0000000000e1', 'guardian'),
  ('14160000-0000-4000-8000-0000000000a3', '14160000-0000-4000-8000-0000000000e2', 'self'),
  ('14160000-0000-4000-8000-0000000000a6', '14160000-0000-4000-8000-0000000000e3', 'guardian'),
  ('14160000-0000-4000-8000-0000000000a2', '14160000-0000-4000-8000-0000000000e4', 'guardian'),
  ('14160000-0000-4000-8000-0000000000a3', '14160000-0000-4000-8000-0000000000e5', 'guardian');

-- Structure: row level security on, no grants for any client role, no policies, and not in the sync rules.
select is(
  (select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
    and relname in ('athlete_recovery_identities', 'athlete_recovery_codes', 'athlete_recovery_code_failures')),
  3, 'row level security is on in the three tables'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
    and tablename in ('athlete_recovery_identities', 'athlete_recovery_codes', 'athlete_recovery_code_failures')),
  0, 'and they have no policy'
);
select is(
  (select count(*)::int from unnest(array['anon', 'authenticated', 'service_role']) r,
    unnest(array['public.athlete_recovery_identities', 'public.athlete_recovery_codes', 'public.athlete_recovery_code_failures']) t,
    unnest(array['select', 'insert', 'update', 'delete']) p
    where has_table_privilege(r, t, p)),
  0, 'anon, authenticated and service_role have no privilege on them'
);

-- G issues the codes of their swimmer e1.
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
create temp table issued as select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1');
grant select on issued to public;
select is((select count(*)::int from issued), 1, 'the owner gets the codes the first time');
select matches((select main_code from issued), '^TR-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-){3}[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$', 'the permanent code has the provisional format: TR- and 4 groups of 4');
select is((select length(main_code) from issued), 22, 'of 16 characters (22 with the prefix and the dashes)');
select is((select cardinality(recovery_codes) from issued), 8, 'with 8 recovery codes');
select is(
  (select count(*)::int from issued, unnest(recovery_codes) c where c ~ '^RC-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-){3}[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$'),
  8, 'all with the recovery format'
);
select is(
  (select count(distinct c)::int from issued, unnest(recovery_codes) c), 8, 'and different from each other'
);
select lives_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$, 'the owner confirms they saved the codes');
select is(
  (select count(*)::int from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')),
  0, 'after the confirmation the second call returns nothing'
);

-- As the table owner: only hashes are stored, never the text.
reset role;
select is((select count(*)::int from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'), 1,
  'one identity per swimmer, still one after the second call');
select is((select count(*)::int from public.athlete_recovery_codes), 8, 'and still 8 recovery codes');
select is(
  (select code_hash from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  encode(sha256(convert_to(replace((select main_code from issued), '-', ''), 'UTF8')), 'hex'),
  'the identity keeps the sha256 of the permanent code'
);
select is(
  (select count(*)::int from public.athlete_recovery_identities i, issued
    where row_to_json(i)::text like '%' || issued.main_code || '%' or row_to_json(i)::text like '%' || replace(issued.main_code, '-', '') || '%'),
  0, 'no identity row holds the permanent code text'
);
select is(
  (select count(*)::int from public.athlete_recovery_codes c, issued, unnest(issued.recovery_codes) t
    where row_to_json(c)::text like '%' || t || '%' or row_to_json(c)::text like '%' || replace(t, '-', '') || '%'),
  0, 'no recovery code row holds any recovery code text'
);
select is(
  (select count(*)::int from public.athlete_recovery_code_failures), 0, 'no failed attempt yet'
);

-- Owners: the adult athlete X issues theirs too; G2 issues theirs.
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is((select count(*)::int from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e2')), 1,
  'an adult athlete issues their own codes (relation self)');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is((select count(*)::int from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e3')), 1,
  'another guardian issues the codes of their own swimmer');

-- Nobody but the owner issues, regenerates or reads: G2, coach, school admin, stranger, platform admin (all authenticated) and anon.
select throws_ok(
  $$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'another guardian cannot issue the codes of a swimmer they do not manage'
);
select throws_ok(
  $$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'nor regenerate them'
);
select throws_ok($$select * from public.athlete_recovery_identities$$, '42501', null, 'nor read the identities');
select throws_ok($$select * from public.athlete_recovery_codes$$, '42501', null, 'nor the codes');
select throws_ok($$select * from public.athlete_recovery_code_failures$$, '42501', null, 'nor the failed attempts');

set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok($$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'a coach of the swimmer cannot issue their codes');
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'nor regenerate them');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok($$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'a school admin cannot issue the codes');
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'nor regenerate them');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok($$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'a stranger cannot issue the codes');
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'nor regenerate them');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok($$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'a platform admin cannot issue the codes');
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'nor regenerate them');
select throws_ok($$select * from public.athlete_recovery_identities$$, '42501', null, 'nor read the identities');
select throws_ok($$select app.redeem_athlete_recovery_code('TR-AAAAAAAAAAAA')$$, '42501', null,
  'nor redeem a code: the function has no grant for clients');

set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok($$select * from public.athlete_recovery_identities$$, '42501', null, 'a coach cannot read the identities');
select throws_ok($$select * from public.athlete_recovery_codes$$, '42501', null, 'a coach cannot read the codes');
select throws_ok($$select * from public.athlete_recovery_code_failures$$, '42501', null, 'a coach cannot read the failed attempts');
select throws_ok($$select app.redeem_athlete_recovery_code('TR-AAAAAAAAAAAA')$$, '42501', null, 'a coach cannot execute redeem');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok($$select * from public.athlete_recovery_identities$$, '42501', null, 'a school admin cannot read the identities');
select throws_ok($$select * from public.athlete_recovery_codes$$, '42501', null, 'a school admin cannot read the codes');
select throws_ok($$select * from public.athlete_recovery_code_failures$$, '42501', null, 'a school admin cannot read the failed attempts');
select throws_ok($$select app.redeem_athlete_recovery_code('TR-AAAAAAAAAAAA')$$, '42501', null, 'a school admin cannot execute redeem');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok($$select * from public.athlete_recovery_identities$$, '42501', null, 'a stranger cannot read the identities');
select throws_ok($$select * from public.athlete_recovery_codes$$, '42501', null, 'a stranger cannot read the codes');
select throws_ok($$select * from public.athlete_recovery_code_failures$$, '42501', null, 'a stranger cannot read the failed attempts');
select throws_ok($$select app.redeem_athlete_recovery_code('TR-AAAAAAAAAAAA')$$, '42501', null, 'a stranger cannot execute redeem');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'a user without a session cannot issue the codes');
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1')$$, '42501', null,
  'nor regenerate them');
select throws_ok($$select app.redeem_athlete_recovery_code('TR-AAAAAAAAAAAA')$$, '42501', null, 'nor redeem a code');
select throws_ok($$select * from public.athlete_recovery_codes$$, '42501', null, 'nor read the codes');
reset role;

-- Redeeming (for the functions of T156, run here as the table owner with the caller's claims).
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  app.redeem_athlete_recovery_code((select main_code from issued)),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  'the permanent code resolves the identity of the swimmer'
);
select is(
  app.redeem_athlete_recovery_code(replace((select main_code from issued), '-', '')),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  'the ungrouped form (no dashes) resolves the same identity as the grouped one'
);
select is(
  app.redeem_athlete_recovery_code(lower(replace((select main_code from issued), '-', ' '))),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  'in any case and with a space instead of the dash, and as many times as needed'
);
select is(
  app.redeem_athlete_recovery_code((select recovery_codes[1] from issued)),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  'a recovery code resolves the same identity'
);
select isnt((select used_at from public.athlete_recovery_codes where code_hash =
  encode(sha256(convert_to(replace((select recovery_codes[1] from issued), '-', ''), 'UTF8')), 'hex')), null,
  'and is marked used');
select is(app.redeem_athlete_recovery_code((select recovery_codes[1] from issued)), null, 'the second use of a recovery code fails');
select is(app.redeem_athlete_recovery_code('TR-ZZZZZZZZZZZZ'), null, 'an unknown code matches nothing');
select is(app.redeem_athlete_recovery_code(null), null, 'nor does a null code');
select is((select count(*)::int from public.athlete_recovery_code_failures), 3, 'the failed attempts were recorded, not rolled back');

-- Regenerate: not before a recovery code of the set was used.
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e2')$$,
  'P0001', 'no_recovery_code_used', 'regenerating fails while no recovery code was used'
);
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
create temp table regenerated as select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e1') as codes;
grant select on regenerated to public;
select is((select cardinality(codes) from regenerated), 8, 'after a code was used, the owner gets a new set of 8');
reset role;
select is(
  (select count(*)::int from public.athlete_recovery_codes c join public.athlete_recovery_identities i on i.id = c.identity_id
    where i.athlete_id = '14160000-0000-4000-8000-0000000000e1' and c.code_set = 2),
  8, 'stored as set 2'
);
select is(
  (select count(*)::int from public.athlete_recovery_codes c join public.athlete_recovery_identities i on i.id = c.identity_id
    where i.athlete_id = '14160000-0000-4000-8000-0000000000e1' and c.code_set = 1 and c.used_at is null),
  0, 'and the unused codes of the first set were removed'
);
select is(
  (select code_hash from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  encode(sha256(convert_to(replace((select main_code from issued), '-', ''), 'UTF8')), 'hex'),
  'the permanent code does not change'
);
select is(
  (select count(*)::int from public.athlete_recovery_codes c, regenerated r, unnest(r.codes) t
    where row_to_json(c)::text like '%' || t || '%' or row_to_json(c)::text like '%' || replace(t, '-', '') || '%'),
  0, 'the new codes are not stored as text either'
);
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(app.redeem_athlete_recovery_code((select recovery_codes[2] from issued)), null, 'an unused code of the previous set no longer works');
select is(
  app.redeem_athlete_recovery_code((select codes[1] from regenerated)),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  'a code of the new set works and resolves the same identity'
);
select is(app.redeem_athlete_recovery_code((select codes[1] from regenerated)), null, 'once');

-- Regenerate on a swimmer without codes.
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
reset role;
delete from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e3';
set local role authenticated;
select throws_ok(
  $$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e3')$$,
  'P0001', 'no_recovery_identity', 'regenerating fails when the swimmer has no codes yet'
);
reset role;

-- Two swimmers never share a hash.
select throws_ok(
  $$insert into public.athlete_recovery_identities (athlete_id, code_hash)
    select '14160000-0000-4000-8000-0000000000e3', code_hash from public.athlete_recovery_identities
    where athlete_id = '14160000-0000-4000-8000-0000000000e1'$$,
  '23505', null, 'a second swimmer cannot take the hash of the permanent code of another'
);
select throws_ok(
  $$insert into public.athlete_recovery_codes (identity_id, code_set, code_hash)
    select identity_id, 9, code_hash from public.athlete_recovery_codes limit 1$$,
  '23505', null, 'nor a recovery code the hash of another recovery code'
);
select throws_ok(
  $$insert into public.athlete_recovery_identities (athlete_id, code_hash)
    values ('14160000-0000-4000-8000-0000000000e1', repeat('a', 64))$$,
  '23505', null, 'and a swimmer has one identity only'
);

-- Confirm step: until the owner confirms they saved the texts, issuing again replaces the whole set (swimmer e4, owner G).
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
create temp table first_issue as select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e4');
create temp table second_issue as select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e4');
grant select on first_issue, second_issue to public;
select is((select count(*)::int from second_issue), 1, 'before the confirmation the owner can issue the codes again');
select isnt((select main_code from second_issue), (select main_code from first_issue), 'with a new permanent code');
select is((select count(*)::int from first_issue f, second_issue s, unnest(f.recovery_codes) a where a = any(s.recovery_codes)), 0,
  'and new recovery codes');
reset role;
select is((select count(*)::int from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e4'), 1,
  'still one identity');
select is((select count(*)::int from public.athlete_recovery_codes c join public.athlete_recovery_identities i on i.id = c.identity_id
  where i.athlete_id = '14160000-0000-4000-8000-0000000000e4'), 8, 'and 8 codes: the first set was replaced, not added to');
delete from public.athlete_recovery_code_failures;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(app.redeem_athlete_recovery_code((select main_code from first_issue)), null, 'the replaced permanent code no longer works');
select is(app.redeem_athlete_recovery_code((select recovery_codes[1] from first_issue)), null, 'nor a replaced recovery code');
select is(
  app.redeem_athlete_recovery_code((select main_code from second_issue)),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e4'),
  'the new permanent code works'
);
-- Confirm: the owner only; a swimmer without codes has nothing to confirm.
set local role authenticated;
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e4')$$, '42501', null,
  'a stranger cannot confirm');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e4')$$, '42501', null,
  'nor a coach of the swimmer');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e4')$$, '42501', null,
  'nor a platform admin');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e4')$$, '42501', null,
  'nor a user without a session');
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e3')$$, 'P0001', 'no_recovery_identity',
  'confirming fails when the swimmer has no codes yet');
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e4')$$, 'the owner confirms');
select is((select count(*)::int from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e4')), 0,
  'after the confirmation issuing returns nothing: lost means lost');
reset role;
select is(
  (select code_hash from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e4'),
  encode(sha256(convert_to(replace((select main_code from second_issue), '-', ''), 'UTF8')), 'hex'),
  'and changes nothing'
);
create temp table confirmed_at_1 as select confirmed_at from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e4';
select isnt((select confirmed_at from confirmed_at_1), null, 'the confirmation is recorded');
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e4');
reset role;
select is((select confirmed_at from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e4'),
  (select confirmed_at from confirmed_at_1), 'confirming again is harmless and keeps the first date');

-- Limit of failed attempts (PROVISIONAL: 5 in 15 minutes), also for a correct code.
delete from public.athlete_recovery_code_failures;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  (select count(*)::int from generate_series(1, 5) n where app.redeem_athlete_recovery_code('TR-BBBBBBBBBBBB') is null),
  5, 'five failed attempts are answered with no match'
);
select throws_ok(
  $$select app.redeem_athlete_recovery_code((select codes[2] from regenerated))$$,
  'P0001', 'too_many_attempts', 'the sixth is refused with a limit error, with a correct code too'
);
select is(
  (select used_at from public.athlete_recovery_codes where code_hash =
    encode(sha256(convert_to(replace((select codes[2] from regenerated), '-', ''), 'UTF8')), 'hex')),
  null, 'a refused attempt does not consume the code: the correct one is still unused'
);
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  app.redeem_athlete_recovery_code((select codes[2] from regenerated)),
  (select id from public.athlete_recovery_identities where athlete_id = '14160000-0000-4000-8000-0000000000e1'),
  'the limit is per user: another user redeems the same code'
);
update public.athlete_recovery_code_failures set failed_at = now() - interval '16 minutes';
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(app.redeem_athlete_recovery_code('TR-BBBBBBBBBBBB'), null, 'after 15 minutes the user can try again');

-- A call without a user.
set local request.jwt.claims = '{"role": "service_role"}';
select throws_ok($$select app.redeem_athlete_recovery_code('TR-BBBBBBBBBBBB')$$, '42501', null, 'redeeming needs a signed-in user');

-- A swimmer that is deleted detaches the identity instead of deleting it: only hashes stay, with no athlete (PROVISIONAL for a swimmer
-- without school times; the case with times is in recovery_code_erasure.test.sql).
reset role;
delete from public.athlete_managers where athlete_id = '14160000-0000-4000-8000-0000000000e2';
delete from public.athletes where id = '14160000-0000-4000-8000-0000000000e2';
select is(
  (select count(*)::int from public.athlete_recovery_identities where athlete_id is null), 1,
  'deleting the swimmer keeps their identity, detached from any swimmer');
select is(
  (select count(*)::int from public.athlete_recovery_codes where identity_id = (select id from public.athlete_recovery_identities where athlete_id is null)),
  8, 'and its recovery codes');
update public.athlete_recovery_identities set code_hash = app.athlete_recovery_code_hash('TR-ORPHANORPHAN') where athlete_id is null;
create temp table orphan as select id from public.athlete_recovery_identities where athlete_id is null;
create temp table others_before as select id, code_hash, confirmed_at from public.athlete_recovery_identities where athlete_id is not null;

-- An orphan identity never crashes anything and never touches another swimmer.
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(app.redeem_athlete_recovery_code('TR-ORPHANORPHAN'), (select id from orphan),
  'redeeming the code of an orphan identity answers it, with no swimmer behind it');
select is(app.redeem_athlete_recovery_code('TR-ORPHANORPHAX'), null, 'and a wrong code still matches nothing');
set local role authenticated;
set local request.jwt.claims = '{"sub": "14160000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e2')$$, '42501', null,
  'regenerating for the deleted swimmer is refused: nobody manages them any more');
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e2')$$, '42501', null,
  'and so is confirming');
select throws_ok($$select * from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e2')$$, '42501', null,
  'and issuing');
select throws_ok($$select public.regenerate_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e5')$$, 'P0001', 'no_recovery_identity',
  'a new swimmer without codes does not get the orphan identity on regenerate');
select throws_ok($$select public.confirm_athlete_recovery_codes('14160000-0000-4000-8000-0000000000e5')$$, 'P0001', 'no_recovery_identity',
  'nor on confirm');
select is((select count(*)::int from public.issue_athlete_recovery_code('14160000-0000-4000-8000-0000000000e5')), 1,
  'issuing for a new swimmer creates a new identity');
reset role;
select is((select athlete_id from public.athlete_recovery_identities where id = (select id from orphan)), null::uuid,
  'the orphan identity was not reused: it is still detached');
select is((select code_hash from public.athlete_recovery_identities where id = (select id from orphan)),
  app.athlete_recovery_code_hash('TR-ORPHANORPHAN'), 'and unchanged');
select is(
  (select count(*)::int from public.athlete_recovery_identities i join others_before o on o.id = i.id
    where i.code_hash is distinct from o.code_hash or i.confirmed_at is distinct from o.confirmed_at),
  0, 'no other swimmer identity was touched');

select * from finish();
rollback;
