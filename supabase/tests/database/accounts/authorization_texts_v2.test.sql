-- The es-CO version 2 authorization texts (issue #1415): one row for each of the four existing purposes, no new
-- purpose yet, the version 1 rows are exactly what the earlier migrations left, and no text names a real school,
-- league or federation. Reads what the migrations inserted, so it needs the migrated database (`supabase test db`).
-- Nothing is written outside the rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select set_eq(
  'select code from public.authorization_purposes',
  $$ values ('record_times'), ('import_official_results'), ('share_results_with_school'), ('show_photo') $$,
  'the purposes are still the four codes: the school_* purposes wait for the issue that shows them'
);

select results_eq(
  $$select purpose from public.authorization_texts where version = 2 and language = 'es-CO' order by purpose$$,
  $$values ('import_official_results'::text), ('record_times'), ('share_results_with_school'), ('show_photo')$$,
  'there is exactly one es-CO version 2 text for each of the four purposes'
);

select results_eq(
  $$select purpose, body from public.authorization_texts
    where version = 1 and language = 'es-CO' order by purpose$$,
  $$values
    ('import_official_results'::text, 'Permite buscar los resultados oficiales del deportista en la federación de natación y agregarlos a su historial en Swimcro. Sin esta autorización no podemos traer esos resultados.'::text),
    ('record_times', 'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. Si la retiras, esos tiempos dejan de mostrarse.'),
    ('share_results_with_school', 'Permite que otra escuela en la que también esté inscrito el deportista vea sus tiempos y resultados. Si no la activas, solo los ve tu escuela.'),
    ('show_photo', 'Permite guardar la foto del deportista en Swimcro y mostrarla a su acudiente, a sus entrenadores y a su escuela. Si la retiras, la foto deja de mostrarse en todos los dispositivos.')$$,
  'the es-CO version 1 texts are unchanged and there are no others'
);

select is(
  (select count(*) from public.authorization_texts where version = 2 and language <> 'es-CO'),
  0::bigint,
  'version 2 exists only in es-CO'
);

select is(
  (select count(*) from public.authorization_texts where version = 2 and language = 'es-CO'
     and purpose in ('record_times', 'share_results_with_school', 'show_photo')
     and body ilike '%la escuela en la que inscribes al nadador%'),
  3::bigint,
  'the texts that involve the school name it generically as «la escuela en la que inscribes al nadador»'
);

select is(
  (select count(*) from public.authorization_texts where version = 2 and language = 'es-CO'
     and purpose = 'record_times'
     and body like '%30 días%' and body like '%Swimcro los trata por cuenta%'),
  1::bigint,
  'the record_times text states the 30 days after the baja and that Swimcro acts on the school''s behalf'
);

select is(
  (select count(*) from public.authorization_texts where version = 2 and language = 'es-CO'
     and body ~* '(fecna|liga|academia|atl[aá]ntico|colombia)'),
  0::bigint,
  'no version 2 text names a real school, league or federation'
);

select is(
  (select count(*) from public.authorization_texts where version = 2 and language = 'es-CO'
     and (body like 'TEXTO PROVISIONAL%' or body ~* '(authorization|placeholder|synthetic|not legal)')),
  0::bigint,
  'no version 2 text keeps a provisional marker or English wording'
);

select throws_ok(
  $$update public.authorization_texts set body = 'changed' where purpose = 'show_photo' and version = 2$$,
  '42501',
  'authorization texts cannot change',
  'a version 2 text cannot be changed'
);

select is(
  (select tgenabled::text from pg_trigger
     where tgrelid = 'public.authorization_texts'::regclass
       and tgname = 'authorization_texts_immutable'),
  'O',
  'the immutability trigger is still enabled'
);

select * from finish();
rollback;
