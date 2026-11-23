-- erase_account empties athlete_schools.ended_by (issue #1434). The admin who ended a link erases their account: the link stays
-- ended (ended_at kept) with a null author; the links ended by another admin do not change. The check now allows ended_at without
-- ended_by and still forbids the reverse; end_athlete_school fills both; a client role still cannot write the columns.
-- Users: X (admin that ends A1's link and is erased once they are no longer a member), Y (admin that ends A2's link and stays).
-- Swimmers: A1 (ended by X), A2 (ended by Y), A3 (active, ended with end_athlete_school at the end), A4 (control).
-- All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14340000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;

insert into auth.users (id, email) values (pg_temp.u('e1'), 'admin-x@example.test'), (pg_temp.u('e2'), 'admin-y@example.test');
insert into public.schools (id, name) values (pg_temp.u('c1'), 'Ended By School');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('c1'), pg_temp.u('e1'), 'school_admin'), (pg_temp.u('c1'), pg_temp.u('e2'), 'school_admin');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('d1'), 'One', 'Ended'), (pg_temp.u('d2'), 'Two', 'Ended'), (pg_temp.u('d3'), 'Three', 'Active'), (pg_temp.u('d4'), 'Four', 'Control');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('d1'), pg_temp.u('c1')), (pg_temp.u('d2'), pg_temp.u('c1')), (pg_temp.u('d3'), pg_temp.u('c1'));

-- The links are ended the real way, each by its admin.
set local role authenticated;
select pg_temp.as_user('e1');
select public.end_athlete_school(pg_temp.u('d1'), pg_temp.u('c1'));
select pg_temp.as_user('e2');
select public.end_athlete_school(pg_temp.u('d2'), pg_temp.u('c1'));
reset role;
select set_config('request.jwt.claims', '', true);

create temp table before_erase on commit drop as
select athlete_id, ended_at, ended_by from public.athlete_schools where athlete_id in (pg_temp.u('d1'), pg_temp.u('d2'));

-- X is no longer a member (an active or admin membership blocks the deletion), asks for the deletion and it falls due.
delete from public.school_memberships where user_id = pg_temp.u('e1');
create function pg_temp.mark(text) returns uuid language plpgsql as $$
declare c text; rid uuid;
begin
  c := public.request_account_deletion(pg_temp.u($1)) ->> 'code';
  perform public.confirm_account_deletion(pg_temp.u($1), c);
  update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u($1) returning id into rid;
  return rid;
end;
$$;
create temp table req on commit drop as select pg_temp.mark('e1') as id;

select is((public.erase_account((select id from req)) ->> 'status'), 'deleted', 'the admin who ended a link is erased');
select is((select count(*) from auth.users where id = pg_temp.u('e1')), 0::bigint, 'and is gone from auth.users');
select is((select ended_by from public.athlete_schools where athlete_id = pg_temp.u('d1')), null::uuid, 'the link they ended has no author any more');
select is((select ended_at from public.athlete_schools where athlete_id = pg_temp.u('d1')), (select ended_at from before_erase where athlete_id = pg_temp.u('d1')), 'with the same ended_at');
select is((select ended_at is not null from public.athlete_schools where athlete_id = pg_temp.u('d1')), true, 'so the link stays ended');
select is((select ended_at::text || ended_by::text from public.athlete_schools where athlete_id = pg_temp.u('d2')),
  (select ended_at::text || ended_by::text from before_erase where athlete_id = pg_temp.u('d2')), 'a link ended by another admin does not change');
select is((select counts ->> 'authors_emptied' from public.account_deletion_audit), '1', 'the audit counts the emptied author');

-- The check: ended_at may stand alone, ended_by without ended_at is refused.
select lives_ok($$update public.athlete_schools set ended_by = null where athlete_id = pg_temp.u('d2')$$, 'a link may be ended without an author');
select throws_ok($$insert into public.athlete_schools (athlete_id, school_id, ended_by) values (pg_temp.u('d4'), pg_temp.u('c1'), pg_temp.u('e2'))$$,
  '23514', null, 'ended_by without ended_at is refused');

-- The baja still fills both, and a client role still cannot write the columns.
set local role authenticated;
select pg_temp.as_user('e2');
select public.end_athlete_school(pg_temp.u('d3'), pg_temp.u('c1'));
reset role;
select is((select ended_at is not null and ended_by = pg_temp.u('e2') from public.athlete_schools where athlete_id = pg_temp.u('d3')), true, 'end_athlete_school fills ended_at and ended_by');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('d4'), pg_temp.u('c1'));
set local role authenticated;
select pg_temp.as_user('e2');
select throws_ok($$update public.athlete_schools set ended_at = now(), ended_by = pg_temp.u('e2') where athlete_id = pg_temp.u('d4')$$,
  '42501', null, 'an admin still cannot set the columns with an update');
select throws_ok($$update public.athlete_schools set ended_by = pg_temp.u('e2') where athlete_id = pg_temp.u('d4')$$,
  '42501', null, 'nor set ended_by alone');

select * from finish();
rollback;
