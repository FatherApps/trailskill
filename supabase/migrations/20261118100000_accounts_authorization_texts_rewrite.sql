-- One-time rewrite of the es-CO version 1 authorization texts (issue #1185).
--
-- The maintainer approved these bodies on 2026-11-18 and asked that the texts already
-- accepted show them too, with no new acceptance and no new app build. This was decided
-- while the only users were testers: the provisional bodies are replaced in place and are
-- not kept as history. The text ids and version 1 stay, so every authorization keeps
-- pointing at the same text, and a device that was offline during the deploy and uploads
-- an acceptance of a version 1 text later gets the new body too. No row of authorizations
-- changes. The first legally reviewed text (#106) will be version 2, never a rewrite.
--
-- The immutability trigger is turned off only for this update and on again in the same
-- migration. The runner applies each file in one transaction, so if anything fails the
-- whole file rolls back and the trigger stays enabled. Turning it off needs the table
-- owner, the role that runs the migrations. A database without the texts (production
-- loads no seed) gets them inserted by the same statement.
alter table public.authorization_texts disable trigger authorization_texts_immutable;

insert into public.authorization_texts (purpose, version, language, body) values
  ('record_times', 1, 'es-CO', 'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. Si la retiras, esos tiempos dejan de mostrarse.'),
  ('import_official_results', 1, 'es-CO', 'Permite buscar los resultados oficiales del deportista en la federación de natación y agregarlos a su historial en Swimcro. Sin esta autorización no podemos traer esos resultados.'),
  ('share_results_with_school', 1, 'es-CO', 'Permite que otra escuela en la que también esté inscrito el deportista vea sus tiempos y resultados. Si no la activas, solo los ve tu escuela.')
on conflict (purpose, version, language) do update set body = excluded.body;

alter table public.authorization_texts enable trigger authorization_texts_immutable;
