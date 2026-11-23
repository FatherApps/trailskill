-- Version 2 of the es-CO authorization texts of the four existing purposes (issue #1415).
--
-- The maintainer approved the swimmer data lifecycle on 2026-11-22 (docs/product/swimmer-data-lifecycle.md):
-- the family owns the data, the school is the controller while the swimmer is enrolled and for 30 days after
-- the baja, and Swimcro is the school's processor. Version 2 says so, naming the school generically («la escuela
-- en la que inscribes al nadador»), never by a proper name.
--
-- Version 1 rows are never touched: the authorizations already given keep pointing at the text they accepted
-- (the immutability trigger stays on; this file only inserts). The app decides whether a purpose is in force by
-- athlete and purpose, not by version, so a family that accepted version 1 still shows as accepted and nothing
-- asks for the new acceptance yet; a purpose not yet accepted shows the version 2 text. No permission or sync
-- rule changes here. The texts are PENDIENTE de revisión legal (#106).
--
-- Not here on purpose: the purposes school_read_after_end, school_transfer and school_anonymous_copy. The app
-- lists the latest text of every purpose in the table, and builds already in the field have no title for a
-- new one, so they are inserted together with the issue that shows them.
insert into public.authorization_texts (purpose, version, language, body) values
  ('record_times', 2, 'es-CO', 'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. La escuela en la que inscribes al nadador es la responsable de los datos que recoge mientras él esté inscrito y durante 30 días después de su baja; Swimcro los trata por cuenta de la escuela. Si la retiras, esos tiempos dejan de mostrarse.'),
  ('import_official_results', 2, 'es-CO', 'Permite buscar los resultados oficiales del deportista en la federación de natación y agregarlos a su historial en Swimcro. Sin esta autorización no podemos traer esos resultados.'),
  ('share_results_with_school', 2, 'es-CO', 'Es necesaria para que otra escuela vea los tiempos y resultados que registró una escuela distinta: cuando tú se los abres, cuando la escuela que los registró lo aprueba, o cuando aceptas el traslado del historial a una escuela nueva. La escuela en la que inscribes al nadador es la responsable de los datos que recoge mientras él está inscrito en ella. Si no la activas, cada escuela ve solo lo que ella registró.'),
  ('show_photo', 2, 'es-CO', 'Permite guardar la foto del deportista en Swimcro y mostrarla a su acudiente, a sus entrenadores y a la escuela en la que inscribes al nadador. Si la retiras, la foto deja de mostrarse en todos los dispositivos.');
