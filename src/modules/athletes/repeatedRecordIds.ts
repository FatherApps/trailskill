// Issue 1035: a React key repeated in the profile history was reported without a way to tell which source listed the record twice.
// Only ids and kinds are returned, never names or times, so the result is safe to log.
export type RepeatedRecordId = { id: string; sources: string[] };

type Row = { id: string; origin: string; value: { kind: string } };

/** The ids that appear more than once among `rows`, each with where its rows came from ("origin/kind"), in the order found. */
export function repeatedRecordIds(rows: readonly Row[]): RepeatedRecordId[] {
  const sources = new Map<string, string[]>();
  for (const row of rows) sources.set(row.id, [...(sources.get(row.id) ?? []), `${row.origin}/${row.value.kind}`]);
  return [...sources].filter(([, found]) => found.length > 1).map(([id, found]) => ({ id, sources: found }));
}
