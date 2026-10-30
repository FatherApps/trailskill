import type { FoundResult, ImportSummary, OfficialResultsService } from './data/officialResults';
import type { ImportedResultsRepository } from './data/importedResults';

type Values = Omit<FoundResult, 'id'>;

const sameValues = (a: Values, b: Values) =>
  a.stroke === b.stroke && a.distance === b.distance && a.pool === b.pool && a.hundredths === b.hundredths && a.swumOn === b.swumOn && a.competition === b.competition;

/**
 * What the guardian can choose: the listed results the app does not already show. A result with the values the app has,
 * or that matches any change the source already proposed (waiting, kept or used), is left out: a decided change is not
 * offered again. The same id twice counts once. A result that moved to another value stays: importing it never
 * overwrites, the server records a pending change.
 */
export function sortOutFound(found: FoundResult[], shown: Values[]): FoundResult[] {
  const seen = new Set<string>();
  return found.filter((result) => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return !shown.some((known) => sameValues(result, known));
  });
}

export type CheckOutcome =
  | { kind: 'found'; results: FoundResult[] }
  | { kind: 'none' }
  | { kind: 'rate_limited'; retryAt: string }
  | { kind: 'unavailable' };

export type ImportOutcome =
  | ({ kind: 'imported' } & Pick<ImportSummary, 'inserted' | 'duplicates' | 'changes'>)
  // The server forgot the list (it lives 15 minutes): the screen asks again.
  | { kind: 'expired' }
  | { kind: 'failed' };

type Dependencies = { service: OfficialResultsService; repository: ImportedResultsRepository };

export function createOfficialUpdate({ service, repository }: Dependencies) {
  let running: Promise<CheckOutcome> | null = null;

  async function run(athleteId: string): Promise<CheckOutcome> {
    try {
      const outcome = await service.results(athleteId);
      if (!outcome.ok) return outcome.error.code === 'rate_limited' ? { kind: 'rate_limited', retryAt: outcome.error.retryAt } : { kind: 'unavailable' };
      const [imported, changes] = await Promise.all([repository.listByAthlete(athleteId), repository.listAllChanges(athleteId)]);
      const results = sortOutFound(outcome.value, [...imported, ...changes]);
      return results.length === 0 ? { kind: 'none' } : { kind: 'found', results };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  return {
    // A second press while one query runs gets the same answer instead of asking the source again.
    check(athleteId: string): Promise<CheckOutcome> {
      running ??= run(athleteId).finally(() => (running = null));
      return running;
    },

    async importChosen(athleteId: string, chosen: FoundResult[]): Promise<ImportOutcome> {
      const ids = [...new Set(chosen.map((result) => result.id))];
      if (ids.length === 0) return { kind: 'imported', inserted: 0, duplicates: 0, changes: 0 };
      try {
        const outcome = await service.importChosen(athleteId, ids);
        if (outcome.ok) return { kind: 'imported', inserted: outcome.value.inserted, duplicates: outcome.value.duplicates, changes: outcome.value.changes };
        return outcome.error.code === 'unknown_id' ? { kind: 'expired' } : { kind: 'failed' };
      } catch {
        return { kind: 'failed' };
      }
    },
  };
}

export type UpdateButtonState = { visible: false } | { visible: true; disabled: boolean; lastUpdatedAt: string | null };

/** The button exists only with the identity confirmed and the authorization in force; while it checks it stays disabled. */
export function updateButtonState(input: { identityConfirmed: boolean; authorized: boolean; checking: boolean; lastUpdatedAt: string | null }): UpdateButtonState {
  if (!input.identityConfirmed || !input.authorized) return { visible: false };
  return { visible: true, disabled: input.checking, lastUpdatedAt: input.lastUpdatedAt };
}
