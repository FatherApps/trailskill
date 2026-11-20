-- Module: athletes. Issue #1232 (cleanup of the athlete photo design of #1221). Builds on
-- 20261119150500_athletes_photos.sql, which stays as it was applied.
--
-- 1. Delete without show_photo: withdrawing show_photo hides the photo, and the owner of the data
--    (a guardian of the athlete or the adult athlete) can still delete the row and the object. Writing
--    (insert, update) keeps requiring show_photo in force.
-- 2. A replaced object is not readable by anyone: Storage only serves the object the row points to.
-- 3. The Storage API owns object deletion: storage.objects refuses a direct DELETE (trigger
--    protect_objects_delete), and a forced one would leave the file in the backend. So when a photo row
--    is deleted or points to a new object, its old path goes to a private queue; the client deletes the
--    object through the Storage API whenever it can, and draining the queue is a separate issue.
--    Nothing here blocks deleting an athlete or an account.

-- PostgreSQL applies the SELECT policy to the rows a DELETE finds (WHERE or RETURNING), so deleting a
-- row nobody may read deletes nothing. The owner of the data therefore also reads the current photo
-- (row and object) after the withdrawal, to delete it. PowerSync keeps its own condition (show_photo in
-- force), so the row still leaves every device on the next sync.

-- A guardian of the athlete or the adult athlete themselves (every athlete_managers row is one of the
-- two). No show_photo condition: this is who may delete.
create function app.athlete_photo_deletable(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_photo_deletable.athlete in (select app.managed_athlete_ids());
$$;

-- The object is the one an athlete's photo row points to now. A replaced object is not.
create function app.athlete_photo_object_current(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_photos p where p.storage_path = athlete_photo_object_current.object_name
  );
$$;

revoke execute on function app.athlete_photo_deletable(uuid), app.athlete_photo_object_current(text)
  from public, anon;
grant execute on function app.athlete_photo_deletable(uuid), app.athlete_photo_object_current(text)
  to authenticated;

drop policy athlete_photos_select on public.athlete_photos;
create policy athlete_photos_select on public.athlete_photos for select to authenticated
  using (
    (select app.athlete_photo_readable(athlete_id))
    or (select app.athlete_photo_deletable(athlete_id))
  );

drop policy athlete_photos_delete on public.athlete_photos;
create policy athlete_photos_delete on public.athlete_photos for delete to authenticated
  using ((select app.athlete_photo_deletable(athlete_id)));

drop policy athlete_photos_objects_select on storage.objects;
create policy athlete_photos_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'athlete-photos'
    and (select app.athlete_photo_object_current(name))
    and (
      (select app.athlete_photo_readable(app.athlete_photo_object_athlete(name)))
      or (select app.athlete_photo_deletable(app.athlete_photo_object_athlete(name)))
    )
  );

drop policy athlete_photos_objects_delete on storage.objects;
create policy athlete_photos_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'athlete-photos'
    and (select app.athlete_photo_deletable(app.athlete_photo_object_athlete(name)))
  );

-- Objects whose Storage file may still exist and must be deleted through the Storage API. Private: no
-- grant and no policy, only the owner and the service role reach it.
create table public.storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  storage_path text not null,
  queued_at timestamptz not null default now()
);

alter table public.storage_deletion_queue enable row level security;
revoke all on table public.storage_deletion_queue from public, anon, authenticated;

-- Runs for every deleted or replaced photo, also when the athlete is deleted (cascade) and with no
-- policy check: it never blocks a delete.
create function public.athlete_photos_queue_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_deletion_queue (bucket_id, storage_path)
  values ('athlete-photos', old.storage_path);
  -- A path that becomes current again (A to B to A) must not stay queued: the job that drains the queue
  -- would delete the live photo.
  if tg_op = 'UPDATE' then
    delete from public.storage_deletion_queue where bucket_id = 'athlete-photos' and storage_path = new.storage_path;
  end if;
  return null;
end;
$$;

revoke execute on function public.athlete_photos_queue_object_deletion() from public, anon, authenticated;

create trigger athlete_photos_queue_deleted_object
  after delete on public.athlete_photos
  for each row execute function public.athlete_photos_queue_object_deletion();

create trigger athlete_photos_queue_replaced_object
  after update of storage_path on public.athlete_photos
  for each row when (old.storage_path is distinct from new.storage_path)
  execute function public.athlete_photos_queue_object_deletion();
