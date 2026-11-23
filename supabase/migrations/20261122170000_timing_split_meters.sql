-- Module timing: the meters of a free mark (issue #1432, delivery 4 of 5 of rule 8 in docs/product/my-times-rules.md).
-- A coach times with free laps: each intermediate mark is a `split` row, and it can say how far the swimmer was
-- when it was taken, so pace and projection can be worked out later. Null is "no meters known", never 0.
--
-- The upper bound is not the distance (that check stays in the app); it keeps out NaN, Infinity and absurd values, which `meters > 0` alone lets through
-- (NaN sorts above every number) and which a device would read as 0 or garbage.
--
-- Only additive: every existing row keeps `meters` null, with no backfill, so nothing that was stored changes meaning.
-- Old app builds neither send nor read the column. It is immutable once written: measurements_check_update()
-- (latest definition: 20261026090000) lets an update change only its server_columns, and `meters` is not one of them.
-- No policy or function changes: the existing row level security applies to the new column as to the rest of the row.
alter table public.measurements
  add column meters numeric,
  add constraint measurements_meters_positive check (meters > 0 and meters < 100000),
  add constraint measurements_meters_only_on_split check (meters is null or kind = 'split');
