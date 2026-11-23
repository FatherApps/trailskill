-- The es-CO version 3 record_times authorization text (issue #1457): one new row, with the generic wording, the version 1 and 2
-- rows exactly as the earlier migrations left them, no new purpose, and accept_invitation still accepting the purposes with it.
-- Reads what the migrations inserted, so it needs the migrated database (`supabase test db`). All data is synthetic and
-- nothing is written outside the rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is(
  (select body from public.authorization_texts where purpose = 'record_times' and version = 3 and language = 'es-CO'),
  'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. La escuela en la que inscribes al nadador es la responsable de los datos que recoge mientras él esté inscrito y durante 30 días después de su baja, o hasta que otra escuela lo acoja con tu aceptación; Swimcro los trata por cuenta de la escuela. Si la retiras, los tiempos que se tomen desde ese momento se guardan, pero solo los ven tú y el soporte de la plataforma; los tiempos anteriores siguen visibles para la escuela, igual que la copia seudonimizada que la escuela haya conservado.',
  'the es-CO record_times version 3 text is exactly the one approved on the issue'
);

select is(
  (select count(*) from public.authorization_texts where version = 3),
  1::bigint,
  'version 3 exists only for record_times and only in es-CO'
);

select ok(
  (select body ilike '%la escuela en la que inscribes al nadador%' and body not ilike '%dejan de mostrarse%'
   from public.authorization_texts where purpose = 'record_times' and version = 3),
  'the version 3 text names the school generically and no longer says that the times stop showing'
);

select is(
  (select count(*) from public.authorization_texts where version = 3 and language = 'es-CO'
     and body ~* '(fecna|liga|academia|atl[aá]ntico|colombia)'),
  0::bigint,
  'the version 3 text names no real school, league or federation'
);

select is(
  (select body from public.authorization_texts where purpose = 'record_times' and version = 1 and language = 'es-CO'),
  'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. Si la retiras, esos tiempos dejan de mostrarse.',
  'the record_times version 1 text is unchanged'
);

select is(
  (select body from public.authorization_texts where purpose = 'record_times' and version = 2 and language = 'es-CO'),
  'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. La escuela en la que inscribes al nadador es la responsable de los datos que recoge mientras él esté inscrito y durante 30 días después de su baja; Swimcro los trata por cuenta de la escuela. Si la retiras, esos tiempos dejan de mostrarse.',
  'the record_times version 2 text is unchanged'
);

select results_eq(
  $$select purpose, count(*)::int from public.authorization_texts where language = 'es-CO' group by purpose order by purpose$$,
  $$values ('import_official_results'::text, 2), ('record_times', 3), ('share_results_with_school', 2), ('show_photo', 2)$$,
  'only record_times gained a text: the other three purposes keep their versions 1 and 2'
);

select set_eq(
  'select code from public.authorization_purposes',
  $$ values ('record_times'), ('import_official_results'), ('share_results_with_school'), ('show_photo') $$,
  'no new purpose exists'
);

-- accept_invitation still accepts the three purposes of joining a school, with record_times at version 3.
insert into auth.users (id, email) values
  ('57000000-0000-4000-8000-0000000000a1', 'guardian@example.test'),
  ('57000000-0000-4000-8000-0000000000a2', 'admin@example.test');
insert into public.schools (id, name) values ('57000000-0000-4000-8000-0000000000b1', 'Text V3 School');
insert into public.training_groups (id, school_id, name) values
  ('57000000-0000-4000-8000-0000000000d1', '57000000-0000-4000-8000-0000000000b1', 'Group One');
insert into public.school_memberships (school_id, user_id, role) values
  ('57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000a2', 'school_admin');
insert into public.athletes (id, first_name, last_name) values ('57000000-0000-4000-8000-0000000000e1', 'Athlete', 'One');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('57000000-0000-4000-8000-0000000000a1', '57000000-0000-4000-8000-0000000000e1', 'guardian');

set local role authenticated;
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
insert into public.school_invitations (id, school_id, group_id) values
  ('57000000-0000-4000-8000-000000000101', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000d1');
reset role;
do $$ begin
  perform set_config('test.token', (select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.accept_invitation(
       current_setting('test.token'), '57000000-0000-4000-8000-0000000000e1', null, '2026-11-23 10:00:00+00'::timestamptz,
       (select jsonb_agg(jsonb_build_object(
          'id', md5('v3' || t.purpose)::uuid, 'purpose', t.purpose, 'text_id', t.id) order by t.purpose)
        from public.authorization_texts t
        where t.language = 'es-CO' and (t.purpose, t.version) in
          (('record_times', 3), ('import_official_results', 2), ('share_results_with_school', 2)))) $$,
  'a guardian accepts the invitation sending the version 3 record_times text'
);
reset role;

select results_eq(
  $$select a.purpose, t.version from public.authorizations a join public.authorization_texts t on t.id = a.text_id
    where a.athlete_id = '57000000-0000-4000-8000-0000000000e1' order by a.purpose$$,
  $$values ('import_official_results'::text, 2), ('record_times', 3), ('share_results_with_school', 2)$$,
  'the three authorizations are stored, record_times pointing at the version 3 text'
);

select * from finish();
rollback;
