-- The authorization texts the seed loads for es-CO (issue #1034): Spanish, and
-- still marked as provisional and not legal until the legal review (#106).
-- Reads what the seed inserted, so it needs a database where seed.sql ran
-- (`supabase db start` and `supabase db reset` both load it). Nothing is written.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select count(*) from public.authorization_texts where version = 1 and language = 'es-CO'
     and purpose in ('record_times', 'import_official_results', 'share_results_with_school')),
  3::bigint,
  'the seed loads one es-CO text for each of the three purposes'
);

select is(
  (select count(*) from public.authorization_texts where version = 1 and language = 'es-CO'
     and body like 'TEXTO PROVISIONAL, no es texto legal: autorización para %'),
  3::bigint,
  'the three es-CO texts are in Spanish and say they are provisional and not legal'
);

select is(
  (select count(*) from public.authorization_texts where version = 1 and language = 'es-CO'
     and body ~* '(authorization|placeholder|synthetic|not legal)'),
  0::bigint,
  'no es-CO text of the seed keeps English wording'
);

select * from finish();
rollback;
