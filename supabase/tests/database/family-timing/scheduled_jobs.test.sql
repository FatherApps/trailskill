-- The daily family-timing jobs are scheduled through app.schedule_family_timing_jobs() (issue #1015). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(not has_function_privilege('anon', 'app.schedule_family_timing_jobs()', 'execute'), 'anon cannot schedule the jobs');
select ok(not has_function_privilege('authenticated', 'app.schedule_family_timing_jobs()', 'execute'), 'authenticated cannot schedule the jobs');

-- Install pg_cron inside this transaction (rolled back) only where the server can run it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and current_setting('shared_preload_libraries') like '%pg_cron%'
     and current_setting('cron.database_name', true) = current_database() then
    create extension if not exists pg_cron;
  end if;
end;
$$;

-- pg_cron present but scheduling refused: the owner of the function loses access to the cron schema,
-- as a migrate role without cron privileges would. This must never raise.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    create role tmp_no_cron nologin;
    grant tmp_no_cron to postgres with set true;
    grant usage, create on schema app to tmp_no_cron;
    alter function app.schedule_family_timing_jobs() owner to tmp_no_cron;
  end if;
end;
$$;

select case when exists (select 1 from pg_extension where extname = 'pg_cron') then
  collect_tap(
    is(app.schedule_family_timing_jobs(), 0, 'a refused cron.schedule returns 0 instead of raising'),
    is((select count(*) from cron.job where jobname like 'family-timing-%'), 0::bigint, 'a refused cron.schedule leaves no job')
  )
else
  skip('pg_cron cannot be loaded in this test database', 2)
end;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    alter function app.schedule_family_timing_jobs() owner to postgres;
  end if;
end;
$$;

select case when exists (select 1 from pg_extension where extname = 'pg_cron') then
  collect_tap(
    is(app.schedule_family_timing_jobs(), 2, 'schedules both jobs'),
    is(app.schedule_family_timing_jobs(), 2, 'scheduling again succeeds'),
    results_eq(
      $q$ select jobname::text, schedule::text, command::text from cron.job where jobname like 'family-timing-%' order by jobname $q$,
      $q$ values
        ('family-timing-expire-transfers', '27 4 * * *', 'select app.expire_family_timing_transfers()'),
        ('family-timing-purge-deleted', '17 4 * * *', 'select app.purge_family_timing_measurements()') $q$,
      'running it twice keeps exactly one job per name'
    )
  )
else
  skip('pg_cron cannot be loaded in this test database', 3)
end;

select * from finish();
rollback;
