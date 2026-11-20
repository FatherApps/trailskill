-- Athlete photos (issue #1221): the private bucket, the athlete_photos table and the show_photo
-- purpose. Who reads a photo (row and object) is who can already see the athlete AND only while
-- show_photo is in force; who writes it (row and object) is a guardian of the athlete or the adult
-- athlete themselves, also only while show_photo is in force. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- The delete trigger of storage.objects refuses direct deletes unless the Storage API says so.
set local storage.allow_delete_query = 'true';

-- Users: coach A, guardian G, adult athlete X (relation 'self'), school admin S, stranger N with no
-- relations, guardian G2 of an athlete of another school.
insert into auth.users (id, email) values
  ('12210000-0000-4000-8000-0000000000a1', 'photos-coach-a@example.test'),
  ('12210000-0000-4000-8000-0000000000a2', 'photos-guardian-g@example.test'),
  ('12210000-0000-4000-8000-0000000000a3', 'photos-adult-x@example.test'),
  ('12210000-0000-4000-8000-0000000000a4', 'photos-admin-s@example.test'),
  ('12210000-0000-4000-8000-0000000000a5', 'photos-stranger-n@example.test'),
  ('12210000-0000-4000-8000-0000000000a6', 'photos-guardian-g2@example.test');

insert into public.schools (id, name) values
  ('12210000-0000-4000-8000-0000000000b1', 'Photos School One'),
  ('12210000-0000-4000-8000-0000000000b2', 'Photos School Two');

insert into public.training_groups (id, school_id, name) values
  ('12210000-0000-4000-8000-0000000000d1', '12210000-0000-4000-8000-0000000000b1', 'Photos Group One');

insert into public.school_memberships (school_id, user_id, role) values
  ('12210000-0000-4000-8000-0000000000b1', '12210000-0000-4000-8000-0000000000a1', 'coach'),
  ('12210000-0000-4000-8000-0000000000b1', '12210000-0000-4000-8000-0000000000a4', 'school_admin');

insert into public.coach_group_assignments (coach_user_id, group_id)
values ('12210000-0000-4000-8000-0000000000a1', '12210000-0000-4000-8000-0000000000d1');

-- e1: G's, show_photo in force, has a photo. e2: G's, show_photo never given, has a photo row.
-- e3: G's, show_photo in force, no photo yet. e5: G2's, other school, show_photo in force, has a photo.
-- e6: the adult athlete X, show_photo in force, no photo yet.
insert into public.athletes (id, first_name, last_name) values
  ('12210000-0000-4000-8000-0000000000e1', 'Athlete', 'P1'),
  ('12210000-0000-4000-8000-0000000000e2', 'Athlete', 'P2'),
  ('12210000-0000-4000-8000-0000000000e3', 'Athlete', 'P3'),
  ('12210000-0000-4000-8000-0000000000e5', 'Athlete', 'P5'),
  ('12210000-0000-4000-8000-0000000000e6', 'Athlete', 'P6');

insert into public.athlete_schools (athlete_id, school_id) values
  ('12210000-0000-4000-8000-0000000000e1', '12210000-0000-4000-8000-0000000000b1'),
  ('12210000-0000-4000-8000-0000000000e2', '12210000-0000-4000-8000-0000000000b1'),
  ('12210000-0000-4000-8000-0000000000e3', '12210000-0000-4000-8000-0000000000b1'),
  ('12210000-0000-4000-8000-0000000000e5', '12210000-0000-4000-8000-0000000000b2'),
  ('12210000-0000-4000-8000-0000000000e6', '12210000-0000-4000-8000-0000000000b1');

insert into public.athlete_groups (athlete_id, group_id) values
  ('12210000-0000-4000-8000-0000000000e1', '12210000-0000-4000-8000-0000000000d1'),
  ('12210000-0000-4000-8000-0000000000e2', '12210000-0000-4000-8000-0000000000d1'),
  ('12210000-0000-4000-8000-0000000000e3', '12210000-0000-4000-8000-0000000000d1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('12210000-0000-4000-8000-0000000000a2', '12210000-0000-4000-8000-0000000000e1', 'guardian'),
  ('12210000-0000-4000-8000-0000000000a2', '12210000-0000-4000-8000-0000000000e2', 'guardian'),
  ('12210000-0000-4000-8000-0000000000a2', '12210000-0000-4000-8000-0000000000e3', 'guardian'),
  ('12210000-0000-4000-8000-0000000000a6', '12210000-0000-4000-8000-0000000000e5', 'guardian'),
  ('12210000-0000-4000-8000-0000000000a3', '12210000-0000-4000-8000-0000000000e6', 'self');

-- The purpose and its text come from the migration.
select is(
  (select count(*) from public.authorization_purposes where code = 'show_photo'),
  1::bigint,
  'show_photo is an authorization purpose'
);
select is(
  (select count(*) from public.authorization_texts
     where purpose = 'show_photo' and version = 1 and language = 'es-CO' and length(body) > 40),
  1::bigint,
  'show_photo has its es-CO version 1 text'
);
select is(
  (select count(*) from public.authorization_texts
     where purpose = 'show_photo' and body ~* '(authorization|placeholder|synthetic|not legal|TEXTO PROVISIONAL)'),
  0::bigint,
  'the show_photo text carries no English wording or provisional marker'
);

-- show_photo in force for e1, e3, e5 and e6 (as the guardian or the adult, with a device time in the past).
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select v.user_id::uuid, v.athlete_id::uuid, 'show_photo', t.id, now() - interval '1 hour'
from (values
  ('12210000-0000-4000-8000-0000000000a2', '12210000-0000-4000-8000-0000000000e1'),
  ('12210000-0000-4000-8000-0000000000a2', '12210000-0000-4000-8000-0000000000e3'),
  ('12210000-0000-4000-8000-0000000000a6', '12210000-0000-4000-8000-0000000000e5'),
  ('12210000-0000-4000-8000-0000000000a3', '12210000-0000-4000-8000-0000000000e6')
) as v(user_id, athlete_id)
join public.authorization_texts t
  on t.purpose = 'show_photo' and t.version = 1 and t.language = 'es-CO';

-- Photos that already exist, written as the table owner: e1 (granted), e2 (never granted), e5 (granted, other school).
insert into public.athlete_photos (athlete_id, storage_path, created_by) values
  ('12210000-0000-4000-8000-0000000000e1', '12210000-0000-4000-8000-0000000000e1/12210000-0000-4000-8000-0000000000f1.jpg', '12210000-0000-4000-8000-0000000000a2'),
  ('12210000-0000-4000-8000-0000000000e2', '12210000-0000-4000-8000-0000000000e2/12210000-0000-4000-8000-0000000000f2.jpg', '12210000-0000-4000-8000-0000000000a2'),
  ('12210000-0000-4000-8000-0000000000e5', '12210000-0000-4000-8000-0000000000e5/12210000-0000-4000-8000-0000000000f5.jpg', '12210000-0000-4000-8000-0000000000a6');

insert into storage.objects (bucket_id, name, owner) values
  ('athlete-photos', '12210000-0000-4000-8000-0000000000e1/12210000-0000-4000-8000-0000000000f1.jpg', '12210000-0000-4000-8000-0000000000a2'),
  ('athlete-photos', '12210000-0000-4000-8000-0000000000e2/12210000-0000-4000-8000-0000000000f2.jpg', '12210000-0000-4000-8000-0000000000a2'),
  ('athlete-photos', '12210000-0000-4000-8000-0000000000e5/12210000-0000-4000-8000-0000000000f5.jpg', '12210000-0000-4000-8000-0000000000a6');

-- Structure.
select is(
  (select public from storage.buckets where id = 'athlete-photos'),
  false,
  'the athlete-photos bucket exists and is private'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.athlete_photos'::regclass),
  true,
  'athlete_photos has row level security enabled'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'athlete_photos'),
  'athlete_photos is in the powersync publication'
);
select is(
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'athlete_photos_%'),
  3::bigint,
  'storage.objects has the three athlete photo policies (read, insert, delete)'
);

set local role authenticated;

-- Nobody can ask whether show_photo is in force for an athlete they cannot see.
select throws_ok(
  $$ select app.athlete_photo_authorized('12210000-0000-4000-8000-0000000000e5') $$,
  '42501', null,
  'authenticated cannot call app.athlete_photo_authorized directly'
);

-- Guardian G reads the photo of e1 (row and object) and nothing of e2, whose show_photo was never given.
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_photos',
  $$ values ('12210000-0000-4000-8000-0000000000e1'::uuid) $$,
  'guardian G reads the photo row only of the athlete with show_photo in force'
);
select set_eq(
  $$ select name from storage.objects where bucket_id = 'athlete-photos' $$,
  $$ values ('12210000-0000-4000-8000-0000000000e1/12210000-0000-4000-8000-0000000000f1.jpg'::text) $$,
  'guardian G reads the photo object only of the athlete with show_photo in force'
);

-- Coach A (the athlete's group) and school admin S read it too: the athlete is already visible to them.
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_photos',
  $$ values ('12210000-0000-4000-8000-0000000000e1'::uuid) $$,
  'coach A reads the photo row of an athlete of A''s group with show_photo in force'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'athlete-photos'),
  1::bigint,
  'coach A reads the photo object of an athlete of A''s group with show_photo in force'
);
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_photos',
  $$ values ('12210000-0000-4000-8000-0000000000e1'::uuid) $$,
  'school admin S reads the photo row of an athlete of S''s school with show_photo in force'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'athlete-photos'),
  1::bigint,
  'school admin S reads the photo object of an athlete of S''s school with show_photo in force'
);

-- Stranger N: no row, no object, so no signed URL either (Storage signs only what the caller can select).
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty('select 1 from public.athlete_photos', 'a user with no relation to the athlete reads no photo row');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'athlete-photos' $$,
  'a user with no relation to the athlete reads no photo object, so Storage signs no URL for them'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'athlete-photos'
       and name like '12210000-0000-4000-8000-0000000000e1/%' $$,
  'a stranger cannot ask for the photo of e1 by its folder'
);

-- Guardian G2 of another school sees only their own athlete's photo, never e1's.
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_photos',
  $$ values ('12210000-0000-4000-8000-0000000000e5'::uuid) $$,
  'a guardian of another school reads only their own athlete''s photo row'
);

-- Writes by the guardian G: insert, change and delete the photo of e3 (row and object).
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e3', '12210000-0000-4000-8000-0000000000e3/12210000-0000-4000-8000-0000000000f3.jpg') $$,
  'guardian G inserts the photo row of an athlete with show_photo in force'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e3/12210000-0000-4000-8000-0000000000f3.jpg', '12210000-0000-4000-8000-0000000000a2') $$,
  'guardian G uploads the photo object of an athlete with show_photo in force'
);
select is(
  (select created_by from public.athlete_photos where athlete_id = '12210000-0000-4000-8000-0000000000e3'),
  '12210000-0000-4000-8000-0000000000a2'::uuid,
  'the row records who inserted it'
);
select lives_ok(
  $$ update public.athlete_photos
     set storage_path = '12210000-0000-4000-8000-0000000000e3/12210000-0000-4000-8000-0000000000f4.jpg'
     where athlete_id = '12210000-0000-4000-8000-0000000000e3' $$,
  'guardian G points the row at a new object (a new path on each change)'
);
select throws_ok(
  $$ update public.athlete_photos set athlete_id = '12210000-0000-4000-8000-0000000000e1',
       storage_path = '12210000-0000-4000-8000-0000000000e1/12210000-0000-4000-8000-0000000000f7.jpg'
     where athlete_id = '12210000-0000-4000-8000-0000000000e3' $$,
  '42501', null,
  'a row cannot be moved to another athlete, even one the guardian manages'
);
select throws_ok(
  $$ update public.athlete_photos set created_by = '12210000-0000-4000-8000-0000000000a5'
     where athlete_id = '12210000-0000-4000-8000-0000000000e3' $$,
  '42501', null,
  'the author of a row cannot be changed'
);
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e2', '12210000-0000-4000-8000-0000000000e2/12210000-0000-4000-8000-0000000000f9.jpg') $$,
  '42501', null,
  'guardian G cannot insert a photo row while show_photo was never given'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e2/12210000-0000-4000-8000-0000000000f9.jpg', '12210000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'guardian G cannot upload an object while show_photo was never given'
);
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e5', '12210000-0000-4000-8000-0000000000e5/12210000-0000-4000-8000-0000000000f9.jpg') $$,
  '42501', null,
  'guardian G cannot insert a photo row for an athlete G does not manage'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e5/12210000-0000-4000-8000-0000000000f9.jpg', '12210000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'guardian G cannot upload an object for an athlete G does not manage'
);
select throws_ok(
  $$ update public.athlete_photos
     set storage_path = '12210000-0000-4000-8000-0000000000e5/12210000-0000-4000-8000-0000000000f9.jpg'
     where athlete_id = '12210000-0000-4000-8000-0000000000e3' $$,
  '23514', null,
  'a row cannot point to the folder of another athlete'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e3/not-a-uuid.jpg', '12210000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'an object name must be <athlete_id>/<uuid>.jpg'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', 'not-a-uuid/12210000-0000-4000-8000-0000000000f9.jpg', '12210000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'an object folder that is not an athlete id is refused without a cast error'
);

-- Coach A cannot write or delete anything about the photos, even of an athlete A can read.
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e6', '12210000-0000-4000-8000-0000000000e6/12210000-0000-4000-8000-0000000000f6.jpg') $$,
  '42501', null,
  'coach A cannot insert a photo row'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e1/12210000-0000-4000-8000-0000000000f6.jpg', '12210000-0000-4000-8000-0000000000a1') $$,
  '42501', null,
  'coach A cannot upload a photo object'
);
select is_empty(
  $$ update public.athlete_photos set storage_path = storage_path
     where athlete_id = '12210000-0000-4000-8000-0000000000e1' returning id $$,
  'coach A updates no photo row'
);
select is_empty(
  $$ delete from public.athlete_photos where athlete_id = '12210000-0000-4000-8000-0000000000e1' returning id $$,
  'coach A deletes no photo row'
);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'athlete-photos' returning id $$,
  'coach A deletes no photo object'
);

-- School admin S and stranger N cannot write either.
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e6', '12210000-0000-4000-8000-0000000000e6/12210000-0000-4000-8000-0000000000f6.jpg') $$,
  '42501', null,
  'school admin S cannot insert a photo row'
);
select is_empty(
  $$ delete from public.athlete_photos where athlete_id = '12210000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin S deletes no photo row'
);
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e6', '12210000-0000-4000-8000-0000000000e6/12210000-0000-4000-8000-0000000000f6.jpg') $$,
  '42501', null,
  'a stranger cannot insert a photo row'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e6/12210000-0000-4000-8000-0000000000f6.jpg', '12210000-0000-4000-8000-0000000000a5') $$,
  '42501', null,
  'a stranger cannot upload a photo object'
);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'athlete-photos' returning id $$,
  'a stranger deletes no photo object'
);

-- The adult athlete X writes and reads their own photo.
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e6', '12210000-0000-4000-8000-0000000000e6/12210000-0000-4000-8000-0000000000f6.jpg') $$,
  'the adult athlete inserts their own photo row'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12210000-0000-4000-8000-0000000000e6/12210000-0000-4000-8000-0000000000f6.jpg', '12210000-0000-4000-8000-0000000000a3') $$,
  'the adult athlete uploads their own photo object'
);
select set_eq(
  'select athlete_id from public.athlete_photos',
  $$ values ('12210000-0000-4000-8000-0000000000e6'::uuid) $$,
  'the adult athlete reads only their own photo row'
);

-- Guardian G deletes the photo of e3 (row and object).
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select results_eq(
  $$ with d as (
       delete from public.athlete_photos where athlete_id = '12210000-0000-4000-8000-0000000000e3' returning id
     ) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'guardian G deletes the photo row of an athlete with show_photo in force'
);
select results_eq(
  $$ with d as (
       delete from storage.objects
       where bucket_id = 'athlete-photos'
         and name = '12210000-0000-4000-8000-0000000000e3/12210000-0000-4000-8000-0000000000f3.jpg'
       returning id
     ) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'guardian G deletes the photo object of an athlete with show_photo in force'
);

-- G withdraws show_photo for e1 (as the owner, the way the authorization trigger sees it): from then on
-- nobody, not even G, reads the row or the object, and G cannot delete them either.
reset role;
update public.authorizations
set withdrawn_at = now()
where athlete_id = '12210000-0000-4000-8000-0000000000e1' and purpose = 'show_photo';
select is(
  (select is_granted from public.authorization_status
     where athlete_id = '12210000-0000-4000-8000-0000000000e1' and purpose = 'show_photo'),
  false,
  'withdrawing show_photo turns its status off'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty('select 1 from public.athlete_photos', 'after the withdrawal the guardian reads no photo row');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'athlete-photos' $$,
  'after the withdrawal the guardian reads no photo object'
);
select is_empty(
  $$ delete from public.athlete_photos where athlete_id = '12210000-0000-4000-8000-0000000000e1' returning id $$,
  'after the withdrawal the guardian deletes no photo row'
);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'athlete-photos' returning id $$,
  'after the withdrawal the guardian deletes no photo object'
);
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12210000-0000-4000-8000-0000000000e1', '12210000-0000-4000-8000-0000000000e1/12210000-0000-4000-8000-0000000000f8.jpg') $$,
  '42501', null,
  'after the withdrawal the guardian cannot insert a photo row'
);
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty('select 1 from public.athlete_photos', 'after the withdrawal coach A reads no photo row');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'athlete-photos' $$,
  'after the withdrawal coach A reads no photo object'
);
set local request.jwt.claims = '{"sub": "12210000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_photos',
  $$ values ('12210000-0000-4000-8000-0000000000e6'::uuid) $$,
  'after the withdrawal school admin S no longer reads the photo row of that athlete, only the one still in force'
);

reset role;
-- The row and the object still exist for the owner: a withdrawal hides, it does not delete.
select is(
  (select count(*) from public.athlete_photos where athlete_id = '12210000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'the withdrawal hides the row, it does not delete it'
);

-- anon cannot even try.
set local role anon;
select throws_ok(
  $$ select 1 from public.athlete_photos $$,
  '42501', null,
  'anon has no access to athlete_photos'
);

select * from finish();
rollback;
