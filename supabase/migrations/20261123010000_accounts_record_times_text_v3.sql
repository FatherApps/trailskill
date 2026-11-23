-- Version 3 of the es-CO record_times authorization text (issue #1457).
--
-- The full review of the merged legal texts (#1415) found one false sentence in versions 1 and 2: «Si la retiras, esos tiempos
-- dejan de mostrarse.» Withdrawing record_times hides only the times taken AFTER the withdrawal (app.recorded_after_withdrawal,
-- 20261025040000); the earlier times, and the school's pseudonymized copy of #1420, stay visible to the school. Version 3 says so.
--
-- Version 1 and 2 rows are never touched: authorizations already given keep pointing at the text they accepted (the immutability
-- trigger stays on; this file only inserts). The app shows the latest version of a purpose, so a purpose not yet accepted shows
-- this text; a family that accepted version 1 or 2 still shows as accepted, because the app decides by athlete and purpose, not by
-- version. No purpose, permission, sync rule or function changes here. The text is PENDIENTE de revisión legal (#106).
insert into public.authorization_texts (purpose, version, language, body) values
  ('record_times', 3, 'es-CO', 'Permite guardar en Swimcro los tiempos que registran tú y la escuela en entrenamientos y competencias, para que puedas consultarlos después y ver cómo evoluciona el deportista. La escuela en la que inscribes al nadador es la responsable de los datos que recoge mientras él esté inscrito y durante 30 días después de su baja, o hasta que otra escuela lo acoja con tu aceptación; Swimcro los trata por cuenta de la escuela. Si la retiras, los tiempos que se tomen desde ese momento se guardan, pero solo los ven tú y el soporte de la plataforma; los tiempos anteriores siguen visibles para la escuela, igual que la copia seudonimizada que la escuela haya conservado.');
