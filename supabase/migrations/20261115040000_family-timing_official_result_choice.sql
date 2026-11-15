-- Module family-timing: which imported official result goes with a competition time (issue #974, decision 15). One result of
-- the same event and day goes with the only time of it on its own; with several results or times the guardian picks, and each
-- result goes with one time. The choice is remembered as "<provider>:<source result key>", so a correction the source publishes
-- later (a new revision of the result) keeps it. The app checks that a result is used once: a unique index here would make the
-- sync refuse an upload made on another phone before the two choices met, and leave it stuck.

alter table public.family_timing_measurements add column official_result_key text;

comment on column public.family_timing_measurements.official_result_key is
  'Competition only: the imported official result chosen for this time, as provider:source_result_key.';
