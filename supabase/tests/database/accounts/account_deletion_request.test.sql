-- Account deletion, the marking side (issue #1244): a 6-digit code (stored only as a salted hash, 10 minutes, 5 attempts, a
-- limit of sends), the rule of the schools checked by request, by confirm and by the SQL functions themselves, the mark with
-- delete_after at 30 days, the block of a marked account (its writes are refused, a co-guardian keeps theirs) and cancel.
-- The functions are for service_role only: a signed-in user cannot ask the database for their own code.
-- Users: free F1 (confirms), F2 (code expires), F3 (attempts), F4 (send limit), F5 (a school links their swimmer after the code),
-- guardian G with swimmer X active in school S, coach K active in S, DC a deactivated coach of S, admin SA of S, platform admin P,
-- co-guardians M1 (marks) and M2 (does not) of swimmer Y, who is in no school. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

create function pg_temp.u(text) returns uuid language sql as $$ select ('12440000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- Back to the service role: no signed-in user in the claims.
create function pg_temp.no_user() returns void language sql as $$ select set_config('request.jwt.claims', '', true) $$;
-- The code of the last request, read from the answer the function gave the (fake) Edge Function.
create function pg_temp.code_of(text) returns text language sql as $$ select public.request_account_deletion(pg_temp.u($1)) ->> 'code' $$;

insert into auth.users (id, email) values
  (pg_temp.u('f1'), 'free-1@example.test'), (pg_temp.u('f2'), 'free-2@example.test'), (pg_temp.u('f3'), 'free-3@example.test'),
  (pg_temp.u('f4'), 'free-4@example.test'), (pg_temp.u('f5'), 'free-5@example.test'), (pg_temp.u('a1'), 'guardian-g@example.test'),
  (pg_temp.u('a2'), 'coach-k@example.test'), (pg_temp.u('a3'), 'coach-dc@example.test'), (pg_temp.u('a4'), 'admin-sa@example.test'),
  (pg_temp.u('a5'), 'platform-p@example.test'), (pg_temp.u('b1'), 'coguardian-1@example.test'), (pg_temp.u('b2'), 'coguardian-2@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a5'));
insert into public.schools (id, name) values (pg_temp.u('c1'), 'Deletion School');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('c1'), pg_temp.u('a2'), 'coach'), (pg_temp.u('c1'), pg_temp.u('a3'), 'coach'), (pg_temp.u('c1'), pg_temp.u('a4'), 'school_admin');
update public.school_memberships set deactivated_at = now() where user_id = pg_temp.u('a3');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('d1'), 'Athlete', 'X'), (pg_temp.u('d2'), 'Athlete', 'Y'), (pg_temp.u('d3'), 'Athlete', 'Z');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('d1'), pg_temp.u('c1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a1'), pg_temp.u('d1'), 'guardian'), (pg_temp.u('b1'), pg_temp.u('d2'), 'guardian'), (pg_temp.u('b2'), pg_temp.u('d2'), 'guardian'),
  (pg_temp.u('f5'), pg_temp.u('d3'), 'guardian');

-- 1. The rule: who may not delete, and the answer names the school.
select is((public.request_account_deletion(pg_temp.u('a1')) ->> 'status'), 'blocked', 'request: a guardian of a swimmer active in a school is refused');
select is((public.request_account_deletion(pg_temp.u('a1')) -> 'schools' -> 0 ->> 'name'), 'Deletion School', 'request: the answer names the school');
select is((public.request_account_deletion(pg_temp.u('a2')) ->> 'status'), 'blocked', 'request: an active coach is refused');
select is((public.request_account_deletion(pg_temp.u('a4')) ->> 'status'), 'blocked', 'request: a school admin is refused');
select is((public.request_account_deletion(pg_temp.u('a5')) ->> 'reason'), 'platform_admin', 'request: a platform admin is refused (support does it)');
select is((select count(*) from public.account_deletion_codes where user_id in (pg_temp.u('a1'), pg_temp.u('a2'), pg_temp.u('a4'), pg_temp.u('a5'))), 0::bigint, 'a refusal stores no code');
select is((select count(*) from public.account_deletion_code_sends where user_id = pg_temp.u('a1')), 0::bigint, 'a refusal does not count as a send');
select is((public.request_account_deletion(pg_temp.u('a3')) ->> 'status'), 'code_issued', 'request: a deactivated coach may delete');
select is((public.confirm_account_deletion(pg_temp.u('a1'), '000000') ->> 'status'), 'blocked', 'confirm: refused too, with no code involved, and nothing marked');
select is((select count(*) from public.account_deletion_requests where user_id = pg_temp.u('a1')), 0::bigint, 'the SQL function itself marked nothing');

-- 2. The code: 6 digits, a salted hash only, 10 minutes.
create temp table issued on commit drop as select public.request_account_deletion(pg_temp.u('f1')) as r;
select is((select r ->> 'status' from issued), 'code_issued', 'request: a free user gets a code');
select matches((select r ->> 'code' from issued), '^[0-9]{6}$', 'the code has 6 digits');
select is((select r ->> 'email' from issued), 'free-1@example.test', 'the answer carries the account email for the sender');
select is((select count(*) from public.account_deletion_codes c, issued i where c.code_hash = i.r ->> 'code' or c.salt = i.r ->> 'code'), 0::bigint, 'the code is not stored in the clear');
select matches((select code_hash from public.account_deletion_codes where user_id = pg_temp.u('f1')), '^[0-9a-f]{64}$', 'the stored value is a sha-256 hash');
select cmp_ok((select expires_at from public.account_deletion_codes where user_id = pg_temp.u('f1')), '=', now() + interval '10 minutes', 'the code expires in 10 minutes');

-- An expired code.
select pg_temp.code_of('f2');
update public.account_deletion_codes set expires_at = now() - interval '1 second' where user_id = pg_temp.u('f2');
select is((public.confirm_account_deletion(pg_temp.u('f2'), '123456') ->> 'status'), 'code_expired', 'confirm: an expired code fails');
select is((public.confirm_account_deletion(pg_temp.u('f2'), '123456') ->> 'status'), 'code_expired', 'confirm: with no code issued it fails the same way');

-- 5 attempts; the sixth fails even with the right code.
create temp table third on commit drop as select public.request_account_deletion(pg_temp.u('f3')) ->> 'code' as code;
select is((select string_agg(public.confirm_account_deletion(pg_temp.u('f3'), '00000' || n::text) ->> 'status', ',') from generate_series(1, 5) n
  where (select code from third) <> '00000' || n::text), 'invalid_code,invalid_code,invalid_code,invalid_code,invalid_code', 'five wrong attempts are counted');
select is((public.confirm_account_deletion(pg_temp.u('f3'), (select code from third)) ->> 'status'), 'too_many_attempts', 'the sixth attempt fails although the code is right');
select is((select count(*) from public.account_deletion_requests where user_id = pg_temp.u('f3')), 0::bigint, 'and nothing is marked');

-- The limit of sends per account (PROVISIONAL values: 3 in 24 hours).
select is((select string_agg(public.request_account_deletion(pg_temp.u('f4')) ->> 'status', ',') from generate_series(1, 4)), 'code_issued,code_issued,code_issued,rate_limited', 'the fourth code in the window answers rate_limited');

-- 3. The school links the swimmer after the code was sent: confirm, called directly, checks the rule again.
create temp table fifth on commit drop as select public.request_account_deletion(pg_temp.u('f5')) ->> 'code' as code;
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('d3'), pg_temp.u('c1'));
select is((public.confirm_account_deletion(pg_temp.u('f5'), (select code from fifth)) ->> 'status'), 'blocked', 'confirm: a school linked the swimmer meanwhile, refused');
select is((select attempts from public.account_deletion_codes where user_id = pg_temp.u('f5')), 0, 'and it cost no attempt');
update public.athlete_schools set ended_at = now(), ended_by = pg_temp.u('a4') where athlete_id = pg_temp.u('d3');
select is((public.request_account_deletion(pg_temp.u('f5')) ->> 'status'), 'code_issued', 'an ended link no longer blocks');

-- 4. The mark.
select is((select r ->> 'status' from (select public.confirm_account_deletion(pg_temp.u('f1'), (select r ->> 'code' from issued)) as r) c), 'marked', 'confirm: the right code marks the account');
select cmp_ok((select delete_after from public.account_deletion_requests where user_id = pg_temp.u('f1')), '=', now() + interval '30 days', 'delete_after is 30 days from now');
select is((select email from public.account_deletion_requests where user_id = pg_temp.u('f1')), 'free-1@example.test', 'the request keeps the email for the mails');
select is((select count(*) from public.account_deletion_codes where user_id = pg_temp.u('f1')), 0::bigint, 'the code is gone once used');
select is((public.confirm_account_deletion(pg_temp.u('f1'), '123456') ->> 'status'), 'already_marked', 'confirming again changes nothing');
select is((public.request_account_deletion(pg_temp.u('f1')) ->> 'status'), 'already_marked', 'requesting again answers the date');

-- 5. Nobody but service_role calls these.
set local role authenticated;
select pg_temp.as_user('f4');
select throws_ok($$select public.request_account_deletion(pg_temp.u('f4'))$$, '42501', null, 'a signed-in user cannot call request');
select throws_ok($$select public.confirm_account_deletion(pg_temp.u('f4'), '000000')$$, '42501', null, 'a signed-in user cannot call confirm');
select throws_ok($$select public.cancel_account_deletion(pg_temp.u('f4'))$$, '42501', null, 'a signed-in user cannot call cancel');
select throws_ok($$select public.erase_account(gen_random_uuid())$$, '42501', null, 'a signed-in user cannot call erase_account');
select is(public.account_deletion_status(), null::timestamptz, 'account_deletion_status is null for an account that is not marked');
select pg_temp.as_user('f1');
select isnt(public.account_deletion_status(), null::timestamptz, 'account_deletion_status answers the date of the marked account');
reset role;
select pg_temp.no_user();

-- 6. A marked account is blocked: its writes are refused (the trigger covers rows and the functions the app calls).
create temp table m1 on commit drop as select public.confirm_account_deletion(pg_temp.u('b1'), (public.request_account_deletion(pg_temp.u('b1')) ->> 'code')) as r;
set local role authenticated;
select pg_temp.as_user('b1');
select throws_ok($$insert into public.adult_profiles (user_id, first_name, last_name) values (pg_temp.u('b1'), 'Marked', 'Guardian')$$, '42501', 'the account is marked for deletion', 'a marked account cannot write a row');
select throws_ok($$select public.rotate_athlete_share_code(pg_temp.u('d2'))$$, '42501', 'the account is marked for deletion', 'nor through a function the app calls');
select pg_temp.as_user('b2');
select lives_ok($$insert into public.adult_profiles (user_id, first_name, last_name) values (pg_temp.u('b2'), 'Other', 'Guardian')$$, 'the co-guardian keeps writing');
select isnt((select count(*) from public.athletes where id = pg_temp.u('d2')), 0::bigint, 'and reading the swimmer');
reset role;
select pg_temp.no_user();

-- 7. Cancel: the mark goes, the user writes again, nothing was touched.
select is((public.cancel_account_deletion(pg_temp.u('b1')) ->> 'status'), 'cancelled', 'cancel removes the mark');
select is((public.cancel_account_deletion(pg_temp.u('b1')) ->> 'status'), 'not_marked', 'cancelling an account that is not marked says so');
set local role authenticated;
select pg_temp.as_user('b1');
select lives_ok($$insert into public.adult_profiles (user_id, first_name, last_name) values (pg_temp.u('b1'), 'Back', 'Guardian')$$, 'after cancel the account writes again');
reset role;
select pg_temp.no_user();

-- 8. What the sync and the storage see.
select is((select string_agg(a, ',' order by a) from pg_publication_tables t, unnest(t.attnames) a where t.pubname = 'powersync' and t.tablename = 'account_deletion_requests'), 'id,status,user_id', 'PowerSync replicates who is marked, not the email');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'account_marked_refuses_photo_%'), 3::bigint, 'photo files are guarded in Storage');

select * from finish();
rollback;
