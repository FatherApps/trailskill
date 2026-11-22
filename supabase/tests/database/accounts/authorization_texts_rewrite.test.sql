-- The one-time rewrite of the es-CO version 1 authorization texts (issue #1185): after
-- the migrations the three rows hold the approved bodies, and the immutability trigger
-- the migration turned off for its update is on again, so the texts still cannot change.
-- The show_photo text (issue #1221) came later with its own migration and is tested in
-- athletes/photos.test.sql, so the list below leaves it out; so are the two health texts (#1371), tested in
-- athletes/athlete_health_authorization_texts.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select results_eq(
  $$select purpose, body from public.authorization_texts
    where version = 1 and language = 'es-CO' and purpose not in ('show_photo', 'store_health_data', 'share_health_with_school') order by purpose$$,
  $$values
    ('import_official_results'::text, 'Permite buscar los resultados oficiales del deportista en la federación de natación y agregarlos a su historial en Swimcro. Sin esta autorización no podemos traer esos resultados.'::text),
    ('record_times', 'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. Si la retiras, esos tiempos dejan de mostrarse.'),
    ('share_results_with_school', 'Permite que otra escuela en la que también esté inscrito el deportista vea sus tiempos y resultados. Si no la activas, solo los ve tu escuela.')$$,
  'the three es-CO version 1 texts hold the approved bodies'
);

select is(
  (select tgenabled::text from pg_trigger
     where tgrelid = 'public.authorization_texts'::regclass
       and tgname = 'authorization_texts_immutable'),
  'O',
  'the immutability trigger is enabled again after the rewrite'
);

select throws_ok(
  $$update public.authorization_texts set body = 'changed'
    where purpose = 'record_times' and version = 1 and language = 'es-CO'$$,
  '42501',
  'authorization texts cannot change',
  'an update of a text is still refused'
);

select throws_ok(
  $$delete from public.authorization_texts
    where purpose = 'record_times' and version = 1 and language = 'es-CO'$$,
  '42501',
  'authorization texts cannot change',
  'a delete of a text is still refused'
);

select is(
  (select tableowner::text from pg_tables where schemaname = 'public' and tablename = 'authorization_texts'),
  current_user::text,
  'the role that applies migrations owns the table, as disable trigger requires'
);

select * from finish();
rollback;
