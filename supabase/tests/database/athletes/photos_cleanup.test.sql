-- Athlete photos cleanup (issue #1232): the owner of the data deletes the photo (row and object) even
-- after show_photo is withdrawn, nobody writes without it, a replaced object is not readable, and a
-- deleted or replaced photo leaves its path in a private queue. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- The delete trigger of storage.objects refuses direct deletes unless the Storage API says so.
set local storage.allow_delete_query = 'true';

-- Users: coach A, guardian G, adult athlete X (relation 'self'), stranger N with no relations.
insert into auth.users (id, email) values
  ('12320000-0000-4000-8000-0000000000a1', 'cleanup-coach-a@example.test'),
  ('12320000-0000-4000-8000-0000000000a2', 'cleanup-guardian-g@example.test'),
  ('12320000-0000-4000-8000-0000000000a3', 'cleanup-adult-x@example.test'),
  ('12320000-0000-4000-8000-0000000000a5', 'cleanup-stranger-n@example.test');

insert into public.schools (id, name) values ('12320000-0000-4000-8000-0000000000b1', 'Cleanup School');
insert into public.training_groups (id, school_id, name)
values ('12320000-0000-4000-8000-0000000000d1', '12320000-0000-4000-8000-0000000000b1', 'Cleanup Group');
insert into public.school_memberships (school_id, user_id, role)
values ('12320000-0000-4000-8000-0000000000b1', '12320000-0000-4000-8000-0000000000a1', 'coach');
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('12320000-0000-4000-8000-0000000000a1', '12320000-0000-4000-8000-0000000000d1');

-- e1: G's, show_photo withdrawn later, has a photo. e2: G's, show_photo never given, has a photo row.
-- e3: G's, show_photo in force, photo replaced in the test. e4: G's, show_photo in force, deleted as an
-- athlete. e6: the adult athlete X, show_photo withdrawn later, has a photo. e7: G's, never given, no photo.
insert into public.athletes (id, first_name, last_name) values
  ('12320000-0000-4000-8000-0000000000e1', 'Athlete', 'C1'),
  ('12320000-0000-4000-8000-0000000000e2', 'Athlete', 'C2'),
  ('12320000-0000-4000-8000-0000000000e3', 'Athlete', 'C3'),
  ('12320000-0000-4000-8000-0000000000e4', 'Athlete', 'C4'),
  ('12320000-0000-4000-8000-0000000000e6', 'Athlete', 'C6'),
  ('12320000-0000-4000-8000-0000000000e7', 'Athlete', 'C7');

insert into public.athlete_schools (athlete_id, school_id)
select id, '12320000-0000-4000-8000-0000000000b1' from public.athletes where last_name like 'C%';

insert into public.athlete_groups (athlete_id, group_id)
select id, '12320000-0000-4000-8000-0000000000d1' from public.athletes where last_name in ('C1', 'C2', 'C3', 'C4');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e1', 'guardian'),
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e2', 'guardian'),
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e3', 'guardian'),
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e4', 'guardian'),
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e7', 'guardian'),
  ('12320000-0000-4000-8000-0000000000a3', '12320000-0000-4000-8000-0000000000e6', 'self');

insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select v.user_id::uuid, v.athlete_id::uuid, 'show_photo', t.id, now() - interval '1 hour'
from (values
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e1'),
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e3'),
  ('12320000-0000-4000-8000-0000000000a2', '12320000-0000-4000-8000-0000000000e4'),
  ('12320000-0000-4000-8000-0000000000a3', '12320000-0000-4000-8000-0000000000e6')
) as v(user_id, athlete_id)
join public.authorization_texts t
  on t.purpose = 'show_photo' and t.version = 1 and t.language = 'es-CO';

-- Photos written as the table owner: e1, e2, e3, e4 (guardian G) and e6 (adult X).
insert into public.athlete_photos (athlete_id, storage_path, created_by)
select v.athlete_id::uuid, v.athlete_id || '/' || v.photo_id || '.jpg', v.user_id::uuid
from (values
  ('12320000-0000-4000-8000-0000000000e1', '12320000-0000-4000-8000-0000000000f1', '12320000-0000-4000-8000-0000000000a2'),
  ('12320000-0000-4000-8000-0000000000e2', '12320000-0000-4000-8000-0000000000f2', '12320000-0000-4000-8000-0000000000a2'),
  ('12320000-0000-4000-8000-0000000000e3', '12320000-0000-4000-8000-0000000000f3', '12320000-0000-4000-8000-0000000000a2'),
  ('12320000-0000-4000-8000-0000000000e4', '12320000-0000-4000-8000-0000000000f4', '12320000-0000-4000-8000-0000000000a2'),
  ('12320000-0000-4000-8000-0000000000e6', '12320000-0000-4000-8000-0000000000f6', '12320000-0000-4000-8000-0000000000a3')
) as v(athlete_id, photo_id, user_id);

insert into storage.objects (bucket_id, name, owner)
select 'athlete-photos', storage_path, created_by from public.athlete_photos;

-- Structure: the queue is private and the paths are queued by triggers.
select is(
  (select relrowsecurity from pg_class where oid = 'public.storage_deletion_queue'::regclass),
  true,
  'the deletion queue has row level security enabled'
);
select is(
  (select count(*) from pg_policies where tablename = 'storage_deletion_queue'),
  0::bigint,
  'the deletion queue has no policy'
);
select is_empty('select 1 from public.storage_deletion_queue', 'inserting the photos queued nothing');

-- Replacing a photo of e3 as guardian G (show_photo in force): upload a new object, point the row at it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f9.jpg', '12320000-0000-4000-8000-0000000000a2') $$,
  'guardian G uploads the replacement object while show_photo is in force'
);
select results_eq(
  $$ with u as (
       update public.athlete_photos
       set storage_path = '12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f9.jpg'
       where athlete_id = '12320000-0000-4000-8000-0000000000e3' returning id
     ) select count(*) from u $$,
  $$ values (1::bigint) $$,
  'guardian G points the photo row at the new object'
);
select set_eq(
  $$ select name from storage.objects where bucket_id = 'athlete-photos' and name like '12320000-0000-4000-8000-0000000000e3/%' $$,
  $$ values ('12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f9.jpg'::text) $$,
  'after the replacement guardian G reads only the current object, not the old one'
);
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  $$ select name from storage.objects where bucket_id = 'athlete-photos' and name like '12320000-0000-4000-8000-0000000000e3/%' $$,
  $$ values ('12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f9.jpg'::text) $$,
  'after the replacement coach A reads only the current object, not the old one'
);
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'athlete-photos' and name like '12320000-0000-4000-8000-0000000000e3/%' $$,
  'after the replacement a stranger reads neither object'
);
reset role;
select is(
  (select array_agg(storage_path) from public.storage_deletion_queue),
  array['12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f3.jpg'],
  'the replaced object path is queued, once'
);

-- Pointing the row back at an old path takes that path out of the queue (it is the live photo again).
select lives_ok(
  $$ update public.athlete_photos
     set storage_path = '12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f3.jpg'
     where athlete_id = '12320000-0000-4000-8000-0000000000e3' $$,
  'the row can go back to an earlier path'
);
select is(
  (select array_agg(storage_path order by storage_path) from public.storage_deletion_queue),
  array['12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f9.jpg'],
  'the path of the photo that is current again leaves the queue and the one it replaced is queued'
);
update public.athlete_photos
set storage_path = '12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f9.jpg'
where athlete_id = '12320000-0000-4000-8000-0000000000e3';

-- show_photo never given (e2 has a row, e7 has none): guardian G writes nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (athlete_id, storage_path)
     values ('12320000-0000-4000-8000-0000000000e7', '12320000-0000-4000-8000-0000000000e7/12320000-0000-4000-8000-0000000000f7.jpg') $$,
  '42501', null,
  'without show_photo the guardian inserts no photo row'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('athlete-photos', '12320000-0000-4000-8000-0000000000e7/12320000-0000-4000-8000-0000000000f7.jpg', '12320000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'without show_photo the guardian uploads no photo object'
);
select is_empty(
  $$ update public.athlete_photos
     set storage_path = '12320000-0000-4000-8000-0000000000e2/12320000-0000-4000-8000-0000000000f8.jpg'
     where athlete_id = '12320000-0000-4000-8000-0000000000e2' returning id $$,
  'without show_photo the guardian updates no photo row'
);
select is_empty(
  $$ update storage.objects set metadata = '{}'::jsonb where bucket_id = 'athlete-photos' returning id $$,
  'the guardian updates no photo object'
);

-- A stranger N reads and deletes nothing of e2 (never given) or e3 (in force).
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty('select 1 from public.athlete_photos', 'a stranger reads no photo row');
select is_empty($$ select 1 from storage.objects where bucket_id = 'athlete-photos' $$, 'a stranger reads no photo object');
select is_empty(
  $$ delete from public.athlete_photos returning id $$,
  'a stranger deletes no photo row'
);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'athlete-photos' returning id $$,
  'a stranger deletes no photo object'
);

-- show_photo withdrawn for e1 and e6: from then on they are not readable by readers, but the owner of
-- the data deletes the object and then the row (once the row stops pointing at the object only the
-- deletion queue reaches it).
reset role;
update public.authorizations set withdrawn_at = now()
where purpose = 'show_photo'
  and athlete_id in ('12320000-0000-4000-8000-0000000000e1', '12320000-0000-4000-8000-0000000000e6');
set local role authenticated;
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'athlete-photos'
     and name like any (array['12320000-0000-4000-8000-0000000000e1/%', '12320000-0000-4000-8000-0000000000e6/%']) $$,
  'after the withdrawal coach A reads no object of e1 or e6'
);
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select results_eq(
  $$ with d as (
       delete from storage.objects
       where bucket_id = 'athlete-photos' and name = '12320000-0000-4000-8000-0000000000e1/12320000-0000-4000-8000-0000000000f1.jpg'
       returning id
     ) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'with show_photo withdrawn guardian G deletes the photo object'
);
select results_eq(
  $$ with d as (
       delete from public.athlete_photos where athlete_id = '12320000-0000-4000-8000-0000000000e1' returning id
     ) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'with show_photo withdrawn guardian G deletes the photo row'
);
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select results_eq(
  $$ with d as (
       delete from storage.objects
       where bucket_id = 'athlete-photos' and name = '12320000-0000-4000-8000-0000000000e6/12320000-0000-4000-8000-0000000000f6.jpg'
       returning id
     ) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'with show_photo withdrawn the adult athlete deletes their photo object'
);
select results_eq(
  $$ with d as (
       delete from public.athlete_photos where athlete_id = '12320000-0000-4000-8000-0000000000e6' returning id
     ) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'with show_photo withdrawn the adult athlete deletes their photo row'
);

-- Deleting an athlete with a photo works and leaves the path in the queue (e8 has no other relations).
reset role;
insert into public.athletes (id, first_name, last_name) values ('12320000-0000-4000-8000-0000000000e8', 'Athlete', 'C8');
insert into public.athlete_photos (athlete_id, storage_path)
values ('12320000-0000-4000-8000-0000000000e8', '12320000-0000-4000-8000-0000000000e8/12320000-0000-4000-8000-0000000000f8.jpg');
select lives_ok(
  $$ delete from public.athletes where id = '12320000-0000-4000-8000-0000000000e8' $$,
  'deleting an athlete with a photo is not blocked'
);
select is_empty(
  $$ select 1 from public.athlete_photos where athlete_id = '12320000-0000-4000-8000-0000000000e8' $$,
  'the photo row left with the athlete'
);
select set_eq(
  'select storage_path from public.storage_deletion_queue',
  $$ values
       ('12320000-0000-4000-8000-0000000000e3/12320000-0000-4000-8000-0000000000f3.jpg'::text),
       ('12320000-0000-4000-8000-0000000000e1/12320000-0000-4000-8000-0000000000f1.jpg'),
       ('12320000-0000-4000-8000-0000000000e6/12320000-0000-4000-8000-0000000000f6.jpg'),
       ('12320000-0000-4000-8000-0000000000e8/12320000-0000-4000-8000-0000000000f8.jpg') $$,
  'the queue holds the replaced path and the path of every deleted photo, also by cascade'
);
select is(
  (select count(distinct bucket_id) from public.storage_deletion_queue where bucket_id = 'athlete-photos'),
  1::bigint,
  'every queued path names the athlete-photos bucket'
);

-- The queue is private: authenticated and anon read and write nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12320000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok('select 1 from public.storage_deletion_queue', '42501', null, 'authenticated cannot read the queue');
select throws_ok(
  $$ insert into public.storage_deletion_queue (bucket_id, storage_path) values ('athlete-photos', 'x') $$,
  '42501', null, 'authenticated cannot write the queue'
);
select throws_ok(
  'delete from public.storage_deletion_queue', '42501', null, 'authenticated cannot delete from the queue'
);
select throws_ok(
  $$ select public.athlete_photos_queue_object_deletion() $$, '42501', null,
  'authenticated cannot call the queue trigger function'
);
set local role anon;
select throws_ok('select 1 from public.storage_deletion_queue', '42501', null, 'anon cannot read the queue');
select throws_ok(
  $$ insert into public.storage_deletion_queue (bucket_id, storage_path) values ('athlete-photos', 'x') $$,
  '42501', null, 'anon cannot write the queue'
);

select * from finish();
rollback;
