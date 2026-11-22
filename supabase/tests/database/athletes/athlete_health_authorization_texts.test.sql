-- The es-CO version 1 texts of the two health purposes (issue #1371). Reads what the migration inserted: nothing is written
-- except the one attempt to rewrite a text, which must be refused. The texts are proposals, PENDIENTE de revisión legal (#106).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select results_eq(
  $$select purpose, version, language from public.authorization_texts
    where purpose in ('store_health_data', 'share_health_with_school') order by purpose$$,
  $$values ('share_health_with_school'::text, 1, 'es-CO'::text), ('store_health_data', 1, 'es-CO')$$,
  'each health purpose has exactly one text: version 1, es-CO'
);

select ok(
  (select body from public.authorization_texts where purpose = 'store_health_data' and version = 1 and language = 'es-CO')
    ~ 'datos de salud' and
  (select body from public.authorization_texts where purpose = 'store_health_data' and version = 1 and language = 'es-CO')
    ~ 'se borran',
  'the store_health_data text names the health data and says withdrawing it deletes them'
);

select ok(
  (select body from public.authorization_texts where purpose = 'share_health_with_school' and version = 1 and language = 'es-CO')
    ~ 'emergencia' and
  (select body from public.authorization_texts where purpose = 'share_health_with_school' and version = 1 and language = 'es-CO')
    ~ 'registro',
  'the share_health_with_school text says it is for an emergency and leaves a record'
);

select is(
  (select count(*) from public.authorization_texts
     where purpose in ('store_health_data', 'share_health_with_school') and body ~* '(authorization|placeholder|synthetic|not legal|TEXTO PROVISIONAL)'),
  0::bigint,
  'neither text keeps English wording or a provisional marker'
);

-- Neither purpose is part of the joint acceptance of joining a school (#1328): that function still writes only the three purposes it had.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'accept_invitation'
       and (pg_get_functiondef(p.oid) ~ 'store_health_data' or pg_get_functiondef(p.oid) ~ 'share_health_with_school')),
  0::bigint,
  'accepting an invitation does not grant either health purpose'
);

select throws_ok(
  $$update public.authorization_texts set body = 'changed' where purpose = 'store_health_data' and version = 1 and language = 'es-CO'$$,
  '42501',
  'authorization texts cannot change',
  'the text of version 1 cannot be rewritten'
);

select is(
  (select count(*) from public.authorization_texts where purpose in ('store_health_data', 'share_health_with_school') and version > 1),
  0::bigint,
  'no version 2 exists yet: it comes from the legal review (#106)'
);

select * from finish();
rollback;
