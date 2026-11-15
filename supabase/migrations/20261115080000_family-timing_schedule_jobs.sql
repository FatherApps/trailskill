-- Schedules the daily family-timing jobs when pg_cron is installed; does nothing otherwise (issue #1015).
-- migrate.sh calls it on every deploy, so enabling pg_cron later takes effect without a new migration.
-- cron.schedule upserts by job name, so calling it again keeps one job per name.
create function app.schedule_family_timing_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 0;
  end if;
  perform cron.schedule('family-timing-purge-deleted', '17 4 * * *', 'select app.purge_family_timing_measurements()');
  perform cron.schedule('family-timing-expire-transfers', '27 4 * * *', 'select app.expire_family_timing_transfers()');
  return 2;
end;
$$;

revoke execute on function app.schedule_family_timing_jobs() from public, anon, authenticated;

select app.schedule_family_timing_jobs();
