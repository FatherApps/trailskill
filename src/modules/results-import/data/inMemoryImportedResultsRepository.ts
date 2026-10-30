import type { ImportedResult, ImportedResultsRepository, PendingResultChange } from './importedResults';

type StoredChange = PendingResultChange & { status: 'pending' | 'used_new' | 'kept_current' | 'replaced' };

const newestFirst = (a: ImportedResult, b: ImportedResult) =>
  a.swumOn === b.swumOn ? a.id.localeCompare(b.id) : b.swumOn.localeCompare(a.swumOn);

const oldestFirst = (a: PendingResultChange, b: PendingResultChange) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);

export function createInMemoryImportedResultsRepository(
  results: ImportedResult[],
  changes: StoredChange[],
  imports: { athleteId: string; requestedAt: string }[] = [],
): ImportedResultsRepository {
  const superseded = new Set(results.flatMap((r) => (r.supersedesId ? [r.supersedesId] : [])));
  return {
    async listByAthlete(athleteId) {
      return results.filter((r) => r.athleteId === athleteId && !superseded.has(r.id)).sort(newestFirst);
    },
    async listPendingChanges(athleteId) {
      return changes
        .filter((c) => c.athleteId === athleteId && c.status === 'pending')
        .map(({ status: _status, ...change }) => change)
        .sort(oldestFirst);
    },
    async lastImportedAt(athleteId) {
      const times = imports.filter((i) => i.athleteId === athleteId).map((i) => i.requestedAt);
      return times.length === 0 ? null : times.reduce((a, b) => (a > b ? a : b));
    },
  };
}
