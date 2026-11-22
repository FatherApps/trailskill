-- Module: athletes. Issue #1371 (task 4.3 of the health and emergency design): the es-CO text, version 1, of the two health purposes
-- created by 20261121190000_athletes_health.sql (store_health_data) and 20261121220000_athletes_health_access.sql
-- (share_health_with_school). Both purposes are optional and separate, and neither is part of the joint acceptance of the school (#1328).
--
-- Proposed texts, in the style of show_photo (20261119150500_athletes_photos.sql), and they only say what the code already does: no new
-- rule is written into them. PENDIENTE de revisión legal (#106): the reviewed text will be version 2; version 1 is never rewritten.
-- Nothing of the health design reaches Google Play (build or OTA) before this issue passes that review.
insert into public.authorization_texts (purpose, version, language, body) values
  ('store_health_data', 1, 'es-CO', 'Permite guardar en Swimcro los datos de salud del deportista que escriba su familia: grupo sanguíneo, peso, estatura y alergias. Solo los ve su familia; la escuela solo puede consultarlos si autorizas aparte. Si la retiras, esos datos de salud se borran.'),
  ('share_health_with_school', 1, 'es-CO', 'Permite que el administrador de la escuela del deportista consulte sus datos de salud guardados, solo en una emergencia y dejando un registro de quién los vio, de qué escuela, cuándo y con qué observación; tu familia puede ver ese registro. Si la retiras, la escuela deja de poder consultarlos; los datos y el registro no se borran.')
on conflict (purpose, version, language) do nothing;
