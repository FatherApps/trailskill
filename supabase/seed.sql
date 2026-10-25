-- Synthetic development data only. No real people, schools or organizations.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'demo-coach@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'demo-guardian@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '{"sub":"00000000-0000-4000-8000-000000000001","email":"demo-coach@example.test"}',
   'email', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   '{"sub":"00000000-0000-4000-8000-000000000002","email":"demo-guardian@example.test"}',
   'email', now(), now(), now());

insert into public.schools (id, name)
values ('00000000-0000-4000-8000-0000000000a1', 'Demo Swim School');

insert into public.training_groups (id, school_id, name) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Group A'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'Group B');

insert into public.school_memberships (school_id, user_id, role)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'coach');

insert into public.coach_group_assignments (coach_user_id, group_id)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1');

insert into public.athletes (id, first_name, last_name) values
  ('00000000-0000-4000-8000-0000000000c1', 'Athlete', 'One'),
  ('00000000-0000-4000-8000-0000000000c2', 'Athlete', 'Two'),
  ('00000000-0000-4000-8000-0000000000c3', 'Athlete', 'Three'),
  ('00000000-0000-4000-8000-0000000000c4', 'Athlete', 'Four');

insert into public.athlete_schools (athlete_id, school_id, category_id)
select id, '00000000-0000-4000-8000-0000000000a1', null from public.athletes;

insert into public.athlete_groups (athlete_id, group_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000b2');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c1', 'guardian'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c2', 'guardian');

-- One synthetic text per purpose. Placeholders only: the real, legally
-- reviewed texts are not part of the repository.
insert into public.authorization_texts (purpose, version, language, body) values
  ('record_times', 1, 'es-CO', 'SYNTHETIC PLACEHOLDER, not legal text: authorization to record times.'),
  ('import_official_results', 1, 'es-CO', 'SYNTHETIC PLACEHOLDER, not legal text: authorization to import official results.'),
  ('share_results_with_school', 1, 'es-CO', 'SYNTHETIC PLACEHOLDER, not legal text: authorization to share results with another school.');
