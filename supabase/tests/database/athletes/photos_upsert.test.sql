-- Athlete photo upsert by athlete_id (issue #1253). The sync connector applies a PUT of athlete_photos
-- as INSERT ... ON CONFLICT (athlete_id) DO UPDATE, the way PostgREST writes it, so a device that did not
-- know a photo row already existed replaces it instead of failing with 23505. The same RLS policies and
-- triggers decide: the three traps are the insert policy inside the upsert, the freeze of created_by and
-- the later delete by the id the device sent. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- The delete trigger of storage.objects refuses direct deletes unless the Storage API says so.
set local storage.allow_delete_query = 'true';

-- Users: guardian G and guardian H of the same athlete, stranger N with no relations.
insert into auth.users (id, email) values
  ('12530000-0000-4000-8000-0000000000a1', 'upsert-guardian-g@example.test'),
  ('12530000-0000-4000-8000-0000000000a2', 'upsert-guardian-h@example.test'),
  ('12530000-0000-4000-8000-0000000000a3', 'upsert-stranger-n@example.test');

-- e1: managed by G and H, show_photo in force, photo row created by H. e2: managed by G, show_photo in
-- force, no photo yet. e3: managed by G, show_photo never given, photo row created by G. e4: managed by
-- G, show_photo in force, photo row created by G (the stranger tries it).
insert into public.athletes (id, first_name, last_name) values
  ('12530000-0000-4000-8000-0000000000e1', 'Athlete', 'U1'),
  ('12530000-0000-4000-8000-0000000000e2', 'Athlete', 'U2'),
  ('12530000-0000-4000-8000-0000000000e3', 'Athlete', 'U3'),
  ('12530000-0000-4000-8000-0000000000e4', 'Athlete', 'U4');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e1', 'guardian'),
  ('12530000-0000-4000-8000-0000000000a2', '12530000-0000-4000-8000-0000000000e1', 'guardian'),
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e2', 'guardian'),
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e3', 'guardian'),
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e4', 'guardian');

insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select v.user_id::uuid, v.athlete_id::uuid, 'show_photo', t.id, now() - interval '1 hour'
from (values
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e1'),
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e2'),
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e4')
) as v(user_id, athlete_id)
join public.authorization_texts t
  on t.purpose = 'show_photo' and t.version = 1 and t.language = 'es-CO';

-- Photo rows written as the table owner. The id of e1's row (p1) is the one the server holds; the device
-- that upserts below knows another id.
insert into public.athlete_photos (id, athlete_id, storage_path, created_by) values
  ('12530000-0000-4000-8000-0000000000c1', '12530000-0000-4000-8000-0000000000e1', '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f1.jpg', '12530000-0000-4000-8000-0000000000a2'),
  ('12530000-0000-4000-8000-0000000000c3', '12530000-0000-4000-8000-0000000000e3', '12530000-0000-4000-8000-0000000000e3/12530000-0000-4000-8000-0000000000f3.jpg', '12530000-0000-4000-8000-0000000000a1'),
  ('12530000-0000-4000-8000-0000000000c4', '12530000-0000-4000-8000-0000000000e4', '12530000-0000-4000-8000-0000000000e4/12530000-0000-4000-8000-0000000000f4.jpg', '12530000-0000-4000-8000-0000000000a1');

select is_empty('select 1 from public.storage_deletion_queue', 'inserting the photo rows queued nothing');

-- Guardian G's device did not know about the row of e1 and sends a PUT with its own id and a new path.
-- created_by is not sent: the column default (auth.uid()) satisfies the insert policy and the update
-- branch leaves the author alone.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d1', '12530000-0000-4000-8000-0000000000e1',
             '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f2.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, athlete_id = excluded.athlete_id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  'guardian G replaces the photo row of e1 through an upsert by athlete_id, no 23505'
);

reset role;
select results_eq(
  $$ select count(*) from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e1' $$,
  $$ values (1::bigint) $$,
  'e1 still has exactly one photo row'
);
select results_eq(
  $$ select id, storage_path from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e1' $$,
  $$ values ('12530000-0000-4000-8000-0000000000d1'::uuid, '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f2.jpg'::text) $$,
  'the row has the id the device sent and the new path'
);
select is(
  (select created_by from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e1'),
  '12530000-0000-4000-8000-0000000000a2'::uuid,
  'the author of the row is still guardian H: the upsert did not rewrite created_by'
);
select set_eq(
  $$ select storage_path from public.storage_deletion_queue $$,
  $$ values ('12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f1.jpg'::text) $$,
  'the previous path is queued for deletion and the new one is not'
);

-- A retry of the same PUT changes nothing and queues nothing more.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d1', '12530000-0000-4000-8000-0000000000e1',
             '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f2.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, athlete_id = excluded.athlete_id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  'a retry of the same upsert succeeds'
);
reset role;
select results_eq(
  $$ select (select count(*) from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e1'),
            (select count(*) from public.storage_deletion_queue) $$,
  $$ values (1::bigint, 1::bigint) $$,
  'the retry leaves one row and one queued path'
);

-- Trap: the freeze of created_by. A device that sent its own user as created_by would rewrite the author
-- of a row another guardian created: the update branch refuses it, so the connector never sends it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, created_by, updated_at)
     values ('12530000-0000-4000-8000-0000000000d2', '12530000-0000-4000-8000-0000000000e1',
             '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f5.jpg', '12530000-0000-4000-8000-0000000000a1', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, created_by = excluded.created_by, updated_at = excluded.updated_at $$,
  '42501',
  'athlete photo row keeps its athlete and its author',
  'an upsert that rewrites created_by of a row another guardian created is refused'
);

-- Trap: the insert policy runs inside the upsert even when the row exists. Another user as author is refused.
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, created_by, updated_at)
     values ('12530000-0000-4000-8000-0000000000d3', '12530000-0000-4000-8000-0000000000e1',
             '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f6.jpg', '12530000-0000-4000-8000-0000000000a2', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  '42501',
  'new row violates row-level security policy for table "athlete_photos"',
  'an upsert that names another user as author is refused by the insert policy'
);

-- A path in another athlete's folder is refused by the check constraint, upsert or not.
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d4', '12530000-0000-4000-8000-0000000000e1',
             '12530000-0000-4000-8000-0000000000e2/12530000-0000-4000-8000-0000000000f7.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  '23514',
  null,
  'an upsert whose path is in another athlete folder is refused'
);

reset role;
select results_eq(
  $$ select id, storage_path, created_by from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e1' $$,
  $$ values ('12530000-0000-4000-8000-0000000000d1'::uuid, '12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f2.jpg'::text, '12530000-0000-4000-8000-0000000000a2'::uuid) $$,
  'the refused upserts left the row of e1 as it was'
);

-- Trap: the later delete. The device deletes by the id it sent, which is now the id of the server row.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ with d as (delete from public.athlete_photos where id = '12530000-0000-4000-8000-0000000000d1' returning id) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'guardian G deletes the photo by the id the device sent'
);
reset role;
select is_empty(
  $$ select 1 from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e1' $$,
  'no photo row is left for e1'
);
select set_eq(
  $$ select storage_path from public.storage_deletion_queue $$,
  $$ values ('12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f1.jpg'::text),
            ('12530000-0000-4000-8000-0000000000e1/12530000-0000-4000-8000-0000000000f2.jpg'::text) $$,
  'the path of the deleted photo joins the queue'
);

-- The first PUT of an athlete without a photo still creates the row, authored by the caller.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d5', '12530000-0000-4000-8000-0000000000e2',
             '12530000-0000-4000-8000-0000000000e2/12530000-0000-4000-8000-0000000000f8.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, athlete_id = excluded.athlete_id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  'the first upsert of an athlete without a photo creates the row'
);
reset role;
select results_eq(
  $$ select id, created_by from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e2' $$,
  $$ values ('12530000-0000-4000-8000-0000000000d5'::uuid, '12530000-0000-4000-8000-0000000000a1'::uuid) $$,
  'the created row has the device id and guardian G as author'
);
select is(
  (select count(*) from public.storage_deletion_queue),
  2::bigint,
  'creating the first photo queues nothing'
);

-- Without show_photo in force nobody replaces the photo through this path: refused as before.
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d6', '12530000-0000-4000-8000-0000000000e3',
             '12530000-0000-4000-8000-0000000000e3/12530000-0000-4000-8000-0000000000f9.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  '42501',
  'new row violates row-level security policy for table "athlete_photos"',
  'guardian G cannot replace the photo of e3 without show_photo in force'
);

-- A stranger cannot create or replace the photo of an athlete it does not manage.
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d7', '12530000-0000-4000-8000-0000000000e4',
             '12530000-0000-4000-8000-0000000000e4/12530000-0000-4000-8000-0000000000fa.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  '42501',
  'new row violates row-level security policy for table "athlete_photos"',
  'stranger N cannot replace the photo of e4'
);
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d8', '12530000-0000-4000-8000-0000000000e2',
             '12530000-0000-4000-8000-0000000000e2/12530000-0000-4000-8000-0000000000fb.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  '42501',
  'new row violates row-level security policy for table "athlete_photos"',
  'stranger N cannot replace the photo of e2'
);
-- A stranger cannot create a first photo for an athlete without one, or one it does not manage.
reset role;
delete from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e2';
set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000d9', '12530000-0000-4000-8000-0000000000e2',
             '12530000-0000-4000-8000-0000000000e2/12530000-0000-4000-8000-0000000000fc.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  '42501',
  'new row violates row-level security policy for table "athlete_photos"',
  'stranger N cannot create the first photo of e2'
);

reset role;
select results_eq(
  $$ select athlete_id, storage_path from public.athlete_photos order by athlete_id $$,
  $$ values ('12530000-0000-4000-8000-0000000000e3'::uuid, '12530000-0000-4000-8000-0000000000e3/12530000-0000-4000-8000-0000000000f3.jpg'::text),
            ('12530000-0000-4000-8000-0000000000e4'::uuid, '12530000-0000-4000-8000-0000000000e4/12530000-0000-4000-8000-0000000000f4.jpg'::text) $$,
  'every refused upsert left the photo rows as they were'
);

-- Two devices (#1253, review): guardian G's device replaced the row of e5 (another id), and guardian H's device
-- still holds the old id. Its PATCH and its DELETE find the row by athlete_id, under RLS.
reset role;
insert into public.athletes (id, first_name, last_name) values ('12530000-0000-4000-8000-0000000000e5', 'Athlete', 'U5');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e5', 'guardian'),
  ('12530000-0000-4000-8000-0000000000a2', '12530000-0000-4000-8000-0000000000e5', 'guardian');
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select '12530000-0000-4000-8000-0000000000a1', '12530000-0000-4000-8000-0000000000e5', 'show_photo', t.id, now() - interval '1 hour'
from public.authorization_texts t where t.purpose = 'show_photo' and t.version = 1 and t.language = 'es-CO';
insert into public.athlete_photos (id, athlete_id, storage_path, created_by) values
  ('12530000-0000-4000-8000-0000000000c5', '12530000-0000-4000-8000-0000000000e5', '12530000-0000-4000-8000-0000000000e5/12530000-0000-4000-8000-0000000000fd.jpg', '12530000-0000-4000-8000-0000000000a2');
delete from public.storage_deletion_queue;

set local role authenticated;
set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.athlete_photos (id, athlete_id, storage_path, updated_at)
     values ('12530000-0000-4000-8000-0000000000da', '12530000-0000-4000-8000-0000000000e5',
             '12530000-0000-4000-8000-0000000000e5/12530000-0000-4000-8000-0000000000fe.jpg', now())
     on conflict (athlete_id) do update
       set id = excluded.id, athlete_id = excluded.athlete_id, storage_path = excluded.storage_path, updated_at = excluded.updated_at $$,
  'device of G replaces the photo row of e5 (the old id c5 no longer exists on the server)'
);

set local request.jwt.claims = '{"sub": "12530000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select results_eq(
  $$ select count(*) from public.athlete_photos where id = '12530000-0000-4000-8000-0000000000c5' $$,
  $$ values (0::bigint) $$,
  'by the old id, the device of H finds nothing'
);
select results_eq(
  $$ with u as (
       update public.athlete_photos set storage_path = '12530000-0000-4000-8000-0000000000e5/12530000-0000-4000-8000-0000000000ff.jpg'
       where athlete_id = '12530000-0000-4000-8000-0000000000e5' returning id
     ) select count(*) from u $$,
  $$ values (1::bigint) $$,
  'the PATCH of the device of H updates the row by athlete_id'
);
select results_eq(
  $$ with d as (delete from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e5' returning id) select count(*) from d $$,
  $$ values (1::bigint) $$,
  'the DELETE of the device of H deletes the row by athlete_id'
);
reset role;
select is_empty(
  $$ select 1 from public.athlete_photos where athlete_id = '12530000-0000-4000-8000-0000000000e5' $$,
  'no photo row of e5 stays on the server'
);
select set_eq(
  $$ select storage_path from public.storage_deletion_queue $$,
  $$ values ('12530000-0000-4000-8000-0000000000e5/12530000-0000-4000-8000-0000000000fd.jpg'::text),
            ('12530000-0000-4000-8000-0000000000e5/12530000-0000-4000-8000-0000000000fe.jpg'::text),
            ('12530000-0000-4000-8000-0000000000e5/12530000-0000-4000-8000-0000000000ff.jpg'::text) $$,
  'the replaced, the patched and the deleted objects all went through the deletion queue: none stays referenced'
);

select * from finish();
rollback;
