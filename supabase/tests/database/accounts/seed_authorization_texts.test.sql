-- The authorization texts the seed loads for es-CO, version 1 (issues #1034 and #1185):
-- the bodies the maintainer approved on 2026-11-18, character for character, with no
-- provisional marker left. The legal review (#106) will add version 2.
-- Reads what the seed inserted, so it needs a database where seed.sql ran
-- (`supabase db start` and `supabase db reset` both load it). Nothing is written.
-- The show_photo text (issue #1221) comes from its migration, not the seed: the list leaves it
-- out, while the two checks on provisional markers and English wording cover every es-CO text.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is(
  (select count(*) from public.authorization_texts where version = 1 and language = 'es-CO'
     and purpose in ('record_times', 'import_official_results', 'share_results_with_school')),
  3::bigint,
  'the seed loads one es-CO text for each of the three purposes'
);

select results_eq(
  $$select purpose, body from public.authorization_texts
    where version = 1 and language = 'es-CO' and purpose <> 'show_photo' order by purpose$$,
  $$values
    ('import_official_results'::text, 'Permite buscar los resultados oficiales del deportista en la federación de natación y agregarlos a su historial en Swimcro. Sin esta autorización no podemos traer esos resultados.'::text),
    ('record_times', 'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. Si la retiras, esos tiempos dejan de mostrarse.'),
    ('share_results_with_school', 'Permite que otra escuela en la que también esté inscrito el deportista vea sus tiempos y resultados. Si no la activas, solo los ve tu escuela.')$$,
  'the three es-CO texts are the approved bodies'
);

select is(
  (select count(*) from public.authorization_texts where version = 1 and language = 'es-CO'
     and body like 'TEXTO PROVISIONAL%'),
  0::bigint,
  'no es-CO text starts with TEXTO PROVISIONAL'
);

select is(
  (select count(*) from public.authorization_texts where version = 1 and language = 'es-CO'
     and body ~* '(authorization|placeholder|synthetic|not legal)'),
  0::bigint,
  'no es-CO text of the seed keeps English wording'
);

select * from finish();
rollback;
