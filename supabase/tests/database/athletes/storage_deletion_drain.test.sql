-- Storage deletion queue drain and orphan photo sweep (issue #1233). The functions only decide which objects are due and record
-- the outcome; the Edge Function deletes through the Storage API. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Athletes: d1 has a photo and is deleted in the test (cascade), d2 keeps a photo.
insert into auth.users (id, email) values ('12330000-0000-4000-8000-0000000000a1', 'drain-guardian@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('12330000-0000-4000-8000-0000000000d1', 'Athlete', 'D1'),
  ('12330000-0000-4000-8000-0000000000d2', 'Athlete', 'D2');
insert into public.athlete_photos (athlete_id, storage_path, created_by) values
  ('12330000-0000-4000-8000-0000000000d1', '12330000-0000-4000-8000-0000000000d1/12330000-0000-4000-8000-0000000000f1.jpg', '12330000-0000-4000-8000-0000000000a1'),
  ('12330000-0000-4000-8000-0000000000d2', '12330000-0000-4000-8000-0000000000d2/12330000-0000-4000-8000-0000000000f2.jpg', '12330000-0000-4000-8000-0000000000a1');

-- Privileges: only service_role runs the four functions.
set local role authenticated;
select throws_ok($$ select * from public.claim_storage_deletions() $$, '42501', null, 'authenticated cannot claim queued objects');
select throws_ok($$ select * from public.list_orphan_photo_objects() $$, '42501', null, 'authenticated cannot list orphan objects');
select throws_ok($$ select public.finish_storage_deletion(gen_random_uuid()) $$, '42501', null, 'authenticated cannot finish a queue row');
select throws_ok($$ select public.fail_storage_deletion(gen_random_uuid()) $$, '42501', null, 'authenticated cannot fail a queue row');
reset role;
set local role service_role;
select lives_ok($$ select * from public.claim_storage_deletions() $$, 'service_role claims queued objects');
reset role;

-- Cascade: deleting an athlete with a photo queues its path; claiming it returns the path once.
delete from public.athletes where id = '12330000-0000-4000-8000-0000000000d1';
select is(
  (select count(*) from public.claim_storage_deletions('2026-12-01 12:00+00')),
  1::bigint,
  'the cascade of an athlete delete leaves its photo path claimable'
);
select is(
  (select count(*) from public.claim_storage_deletions('2026-12-01 12:00+00')),
  0::bigint,
  'a claimed object is leased: the same run time claims nothing again'
);
select is(
  (select count(*) from public.claim_storage_deletions('2026-12-01 12:16+00')),
  1::bigint,
  'a claim nobody finished comes back after 15 minutes'
);

-- A failed Storage call keeps the row with its attempt recorded, and a later run retries it.
select is(
  (select public.fail_storage_deletion(id, '2026-12-01 12:16+00') ->> 'status' from public.storage_deletion_queue),
  'ok',
  'fail_storage_deletion answers ok'
);
select results_eq(
  $$ select attempts, last_attempt_at from public.storage_deletion_queue $$,
  $$ values (1, '2026-12-01 12:16+00'::timestamptz) $$,
  'the failed row stays queued with one attempt recorded'
);
select is(
  (select count(*) from public.claim_storage_deletions('2026-12-01 12:20+00')),
  0::bigint,
  'a failed row backs off for 15 minutes'
);
select is(
  (select count(*) from public.claim_storage_deletions('2026-12-02 04:37+00')),
  1::bigint,
  'the next daily run retries the failed row'
);

-- A finished row (deleted or already gone) leaves the queue.
select is((select public.finish_storage_deletion(id) ->> 'status' from public.storage_deletion_queue), 'ok', 'finish_storage_deletion answers ok');
select is_empty('select 1 from public.storage_deletion_queue', 'a finished row is not in the queue any more');
select is(public.finish_storage_deletion(gen_random_uuid()) ->> 'status', 'ok', 'finishing an unknown row is harmless');

-- A path a photo row still points to is skipped and its queue rows dropped (a new row whose path was already queued).
insert into public.storage_deletion_queue (bucket_id, storage_path) values
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d2/12330000-0000-4000-8000-0000000000f2.jpg'),
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d9/12330000-0000-4000-8000-0000000000f9.jpg');
select results_eq(
  $$ select path from public.claim_storage_deletions('2026-12-03 04:37+00') $$,
  $$ values ('12330000-0000-4000-8000-0000000000d9/12330000-0000-4000-8000-0000000000f9.jpg'::text) $$,
  'a queued path some photo row references is never claimed'
);
select is(
  (select count(*) from public.storage_deletion_queue where storage_path like '12330000-0000-4000-8000-0000000000d2/%'),
  0::bigint,
  'the queue row of a referenced path is dropped'
);

-- The batch limit holds.
insert into public.storage_deletion_queue (bucket_id, storage_path)
select 'athlete-photos', 'batch/' || g || '.jpg' from generate_series(1, 5) g;
select is(
  (select count(*) from public.claim_storage_deletions('2026-12-04 04:37+00', 3)),
  3::bigint,
  'a claim returns at most the limit'
);
delete from public.storage_deletion_queue;

-- Orphan sweep. Run time is 2026-12-10 12:00 UTC. o1: no row, 30 h old. o2: no row, 2 h old. o3: row, 30 h old. o4: no row, queued.
-- o5: no row, 30 minutes old.
insert into storage.objects (bucket_id, name, created_at) values
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d3/12330000-0000-4000-8000-0000000000e1.jpg', '2026-12-09 06:00+00'),
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d3/12330000-0000-4000-8000-0000000000e2.jpg', '2026-12-10 10:00+00'),
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d2/12330000-0000-4000-8000-0000000000f2.jpg', '2026-12-09 06:00+00'),
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d3/12330000-0000-4000-8000-0000000000e4.jpg', '2026-12-09 06:00+00'),
  ('athlete-photos', '12330000-0000-4000-8000-0000000000d3/12330000-0000-4000-8000-0000000000e5.jpg', '2026-12-10 11:30+00');
insert into public.storage_deletion_queue (bucket_id, storage_path)
values ('athlete-photos', '12330000-0000-4000-8000-0000000000d3/12330000-0000-4000-8000-0000000000e4.jpg');

select results_eq(
  $$ select path from public.list_orphan_photo_objects('2026-12-10 12:00+00') $$,
  $$ values ('12330000-0000-4000-8000-0000000000d3/12330000-0000-4000-8000-0000000000e1.jpg'::text) $$,
  'only an unreferenced, unqueued object older than 24 hours is an orphan'
);
select is_empty(
  $$ select 1 from public.list_orphan_photo_objects('2026-12-10 12:00+00') where path like '%e2.jpg' $$,
  'an object newer than the grace period is not an orphan'
);
select is_empty(
  $$ select 1 from public.list_orphan_photo_objects('2026-12-10 12:00+00') where path like '%f2.jpg' $$,
  'an object a photo row references is never an orphan, however old'
);
select is(
  (select count(*) from public.list_orphan_photo_objects('2026-12-10 12:00+00', 1)),
  2::bigint,
  'a grace period of one hour lists the 30-hour-old and the 2-hour-old objects, not the 30-minute-old one'
);
select is_empty(
  $$ select 1 from public.list_orphan_photo_objects('2026-12-10 12:00+00', 0) where path like '%e5.jpg' $$,
  'a grace period of zero is raised to one hour: an object uploaded 30 minutes ago is not an orphan'
);
select is(
  (select count(*) from public.list_orphan_photo_objects('2026-12-10 12:00+00', 24, 0)),
  0::bigint,
  'a limit of zero lists nothing'
);

select * from finish();
rollback;
