-- Module: athletes. Issue #1233. Drains public.storage_deletion_queue (issue #1232) and sweeps orphan athlete photos.
-- The accounts-deletion-worker Edge Function (the daily pg_cron -> pg_net job of issue #1244) calls the four functions below
-- as service role and deletes every object through the Storage API. Nothing here deletes from storage.objects: that table
-- refuses a direct DELETE (trigger protect_objects_delete) and a forced one would leave the file in the backend.
-- The scheduled job, its Vault secrets and the shared secret are the ones of migration 20261120120300_accounts_deletion_schedule.sql.

-- Attempts are recorded for the maintainer; a failed row is leased again (backoff) and retried by a later run.
alter table public.storage_deletion_queue
  add column attempts integer not null default 0,
  add column last_attempt_at timestamptz,
  add column leased_until timestamptz;

-- Leases a batch of queued objects for 15 minutes so two runs never take the same row. A path some photo row still points to
-- is not an object to delete (an insert whose path was already queued, issue #1232 contract): its queue rows are dropped here,
-- and deleting that photo later queues the path again.
create function public.claim_storage_deletions(p_now timestamptz default now(), p_limit integer default 50)
returns table (queue_id uuid, bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.storage_deletion_queue q
  where q.bucket_id = 'athlete-photos'
    and exists (select 1 from public.athlete_photos p where p.storage_path = q.storage_path);
  return query
  with due as (
    select q.id from public.storage_deletion_queue q
    where q.leased_until is null or q.leased_until <= p_now
    order by q.queued_at, q.id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.storage_deletion_queue q
  set leased_until = p_now + interval '15 minutes'
  from due
  where q.id = due.id
  returning q.id, q.bucket_id, q.storage_path;
end;
$$;

-- The Storage API deleted the object (or it was already gone): the row is done.
create function public.finish_storage_deletion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.storage_deletion_queue where id = p_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- The Storage API failed: the row stays, with the attempt recorded. It stays leased, so it comes back in a later run.
create function public.fail_storage_deletion(p_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.storage_deletion_queue
  set attempts = attempts + 1, last_attempt_at = p_now, leased_until = p_now + interval '15 minutes'
  where id = p_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Objects of athlete-photos that no photo row points to and that are older than the grace period, which protects an upload
-- whose row is not written yet. The upload that lost a unique(athlete_id) race (23505) leaves such an object and is never queued.
-- The grace period is never below one hour, whatever the caller sends. Objects already queued are left to the queue.
create function public.list_orphan_photo_objects(p_now timestamptz default now(), p_grace_hours integer default 24, p_limit integer default 200)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id = 'athlete-photos'
    and o.created_at < p_now - make_interval(hours => greatest(p_grace_hours, 1))
    and not exists (select 1 from public.athlete_photos p where p.storage_path = o.name)
    and not exists (select 1 from public.storage_deletion_queue q where q.bucket_id = o.bucket_id and q.storage_path = o.name)
  order by o.created_at, o.name
  limit greatest(p_limit, 0);
$$;

revoke execute on function public.claim_storage_deletions(timestamptz, integer), public.finish_storage_deletion(uuid),
  public.fail_storage_deletion(uuid, timestamptz), public.list_orphan_photo_objects(timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_storage_deletions(timestamptz, integer), public.finish_storage_deletion(uuid),
  public.fail_storage_deletion(uuid, timestamptz), public.list_orphan_photo_objects(timestamptz, integer, integer)
  to service_role;
