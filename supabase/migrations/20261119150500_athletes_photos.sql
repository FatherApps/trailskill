-- Module: athletes. Issue #1221 (PR 2 of 4 of the athlete photo design).
-- A photo of an athlete, many of them minors. The row says which object is the current photo; the
-- object lives in a private Storage bucket. Both are readable only by someone who can already see
-- the athlete AND only while the show_photo authorization is in force: withdrawing it hides the row
-- and the object from every reader at once (the PowerSync stream drops the row from the devices on
-- their next sync). Writes (row and object) belong to a guardian of the athlete or the adult athlete
-- themselves, also only while show_photo is in force. Nobody else writes: not a coach, not a school
-- admin. Platform admins read through support online and are not included on purpose: the photo of
-- a minor follows the same rule for everyone.

-- The purpose and its text. The es-CO text is a proposal in the style of the existing ones: the
-- maintainer approves it before the merge (issue #1221). Never rewrite it afterwards: the first
-- legally reviewed text (#106) will be version 2.
insert into public.authorization_purposes (code) values ('show_photo');

insert into public.authorization_texts (purpose, version, language, body) values
  ('show_photo', 1, 'es-CO', 'Permite guardar la foto del deportista en Swimcro y mostrarla a su acudiente, a sus entrenadores y a su escuela. Si la retiras, la foto deja de mostrarse en todos los dispositivos.')
on conflict (purpose, version, language) do nothing;

-- One current photo per athlete. A change uploads a new object under a new path (never an upsert of
-- the same object) and points the row at it. The path must be <athlete_id>/<uuid>.jpg, so a row can
-- never point at another athlete's folder. The row leaves with the athlete; the object does not (the
-- Storage API owns object deletion), see the issue's follow-ups.
create table public.athlete_photos (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes on delete cascade,
  storage_path text not null,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint athlete_photos_path_in_athlete_folder check (
    storage_path ~ ('^' || athlete_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$')
  )
);

alter table public.athlete_photos enable row level security;

grant select, insert, update, delete on table public.athlete_photos to authenticated;
revoke all on table public.athlete_photos from anon;

alter publication powersync add table public.athlete_photos;

-- Private bucket: no public URL ever. JPEG only, as the path says; the size cap is generous for a
-- compressed profile photo and the upload PR (3 of 4) may lower it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('athlete-photos', 'athlete-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- show_photo is in force for the athlete: the status table, kept by the authorization triggers. A
-- missing row is not granted.
create function app.athlete_photo_authorized(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.authorization_status s
    where s.athlete_id = athlete_photo_authorized.athlete
      and s.purpose = 'show_photo'
      and s.is_granted
  );
$$;

-- Who can see the athlete (the existing visibility rules: guardian or adult athlete, coach through a
-- group or a direct assignment, school admin) AND show_photo in force.
create function app.athlete_photo_readable(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_photo_readable.athlete in (select app.visible_athlete_ids())
    and app.athlete_photo_authorized(athlete_photo_readable.athlete);
$$;

-- A guardian of the athlete or the adult athlete themselves (every athlete_managers row is one of the
-- two) AND show_photo in force.
create function app.athlete_photo_writable(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_photo_writable.athlete in (select app.managed_athlete_ids())
    and app.athlete_photo_authorized(athlete_photo_writable.athlete);
$$;

-- The athlete an object name points to: <athlete_id>/<uuid>.jpg or null. The pattern is checked
-- before the cast, so a name that is not ours never raises a cast error inside a policy.
create function app.athlete_photo_object_athlete(object_name text)
returns uuid
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
    then split_part(object_name, '/', 1)::uuid
  end;
$$;

revoke execute on function
  app.athlete_photo_authorized(uuid), app.athlete_photo_readable(uuid),
  app.athlete_photo_writable(uuid), app.athlete_photo_object_athlete(text)
  from public, anon;
grant execute on function
  app.athlete_photo_authorized(uuid), app.athlete_photo_readable(uuid),
  app.athlete_photo_writable(uuid), app.athlete_photo_object_athlete(text)
  to authenticated;

create policy athlete_photos_select on public.athlete_photos for select to authenticated
  using ((select app.athlete_photo_readable(athlete_id)));

create policy athlete_photos_insert on public.athlete_photos for insert to authenticated
  with check (
    (select app.athlete_photo_writable(athlete_id))
    and created_by = (select auth.uid())
  );

-- A change points the row at a new object; the row keeps its athlete.
create policy athlete_photos_update on public.athlete_photos for update to authenticated
  using ((select app.athlete_photo_writable(athlete_id)))
  with check ((select app.athlete_photo_writable(athlete_id)));

create policy athlete_photos_delete on public.athlete_photos for delete to authenticated
  using ((select app.athlete_photo_writable(athlete_id)));

-- Storage: the same rule on the objects of the bucket. The Storage API signs a URL only for an object
-- the caller can select, so a caller who cannot read gets no signed URL either. There is no update
-- policy: a change is a new object under a new path, never an overwrite.
create policy athlete_photos_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'athlete-photos'
    and (select app.athlete_photo_readable(app.athlete_photo_object_athlete(name)))
  );

create policy athlete_photos_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'athlete-photos'
    and (select app.athlete_photo_writable(app.athlete_photo_object_athlete(name)))
  );

create policy athlete_photos_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'athlete-photos'
    and (select app.athlete_photo_writable(app.athlete_photo_object_athlete(name)))
  );
