-- Module accounts: runs the account deletion worker once a day (issue #1244). pg_cron calls app.call_accounts_deletion_worker(), which
-- posts to the Edge Function accounts-deletion-worker through pg_net (the same route issue #1233 uses for its queue worker, so only
-- one scheduled worker exists). Nothing here fails a deploy: without pg_cron, without pg_net or without the two secrets it does
-- nothing, and accounts that are due stay marked and blocked until it runs.
--
-- The maintainer creates two Vault secrets by hand (docs/deploy/prod-supabase-runbook.md): accounts_worker_url (the function URL)
-- and accounts_worker_secret (the same value as ACCOUNTS_WORKER_SECRET in the functions service). pg_net sends the secret in
-- x-worker-secret; the function compares it before doing anything.

create function app.call_accounts_deletion_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select s.decrypted_secret into worker_url from vault.decrypted_secrets s where s.name = 'accounts_worker_url';
  select s.decrypted_secret into worker_secret from vault.decrypted_secrets s where s.name = 'accounts_worker_secret';
  if coalesce(worker_url, '') = '' or coalesce(worker_secret, '') = '' then
    raise warning 'accounts deletion worker is not configured (vault secrets missing)';
    return;
  end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
exception when others then
  -- Only the SQLSTATE: the message of a failed call could echo the URL or the secret.
  raise warning 'accounts deletion worker call failed: SQLSTATE %', sqlstate;
end;
$$;

revoke execute on function app.call_accounts_deletion_worker() from public, anon, authenticated;

-- Schedules the daily job when pg_cron and pg_net are installed; does nothing otherwise. cron.schedule upserts by job name.
create function app.schedule_account_deletion_job()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return 0;
  end if;
  begin
    perform cron.schedule('accounts-deletion-worker', '37 4 * * *', 'select app.call_accounts_deletion_worker()');
    return 1;
  exception when others then
    raise warning 'scheduled account deletion job failed: SQLSTATE %', sqlstate;
    return 0;
  end;
end;
$$;

revoke execute on function app.schedule_account_deletion_job() from public, anon, authenticated;

-- migrate.sh calls app.schedule_family_timing_jobs() on every deploy, so enabling the extensions later takes effect without a new
-- migration: that function also schedules this job (its own result, the count of family-timing jobs, is unchanged).
create or replace function app.schedule_family_timing_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 0;
  end if;
  -- Never fails the caller: a refused schedule logs the SQLSTATE only and returns 0.
  -- The block is a subtransaction, so a partial failure leaves none of the new jobs.
  begin
    perform cron.schedule('family-timing-purge-deleted', '17 4 * * *', 'select app.purge_family_timing_measurements()');
    perform cron.schedule('family-timing-expire-transfers', '27 4 * * *', 'select app.expire_family_timing_transfers()');
    perform app.schedule_account_deletion_job();
    return 2;
  exception when others then
    raise warning 'scheduled jobs failed: SQLSTATE %', sqlstate;
    return 0;
  end;
end;
$$;

revoke execute on function app.schedule_family_timing_jobs() from public, anon, authenticated;

select app.schedule_account_deletion_job();
