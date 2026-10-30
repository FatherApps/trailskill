import type { FoundResult, OfficialResultsService } from './data/officialResults';
import type { ImportedResult, ImportedResultsRepository, PendingResultChange } from './data/importedResults';

/** A result the guardian can choose: new to the app, or changed at the source since it was imported. */
export type FoundItem = { kind: 'new'; result: FoundResult } | { kind: 'changed'; result: FoundResult; current: ImportedResult };

const sameValues = (a: FoundResult, b: Omit<FoundResult, 'sourceResultKey'>) =>
  a.stroke === b.stroke && a.distance === b.distance && a.pool === b.pool && a.hundredths === b.hundredths && a.swumOn === b.swumOn && a.competition === b.competition;

/**
 * Compares what the source reports with what the app already has. A result with the values the app shows, or whose
 * difference already waits for a choice, is left out; the same key twice counts once.
 */
export function sortOutFound(found: FoundResult[], imported: ImportedResult[], pending: PendingResultChange[]): FoundItem[] {
  const currentByKey = new Map(imported.map((result) => [result.sourceResultKey, result]));
  const pendingById = new Map(pending.map((change) => [change.importedResultId, change]));
  const seen = new Set<string>();
  const items: FoundItem[] = [];
  for (const result of found) {
    if (seen.has(result.sourceResultKey)) continue;
    seen.add(result.sourceResultKey);
    const current = currentByKey.get(result.sourceResultKey);
    if (!current) items.push({ kind: 'new', result });
    else if (!sameValues(result, current) && !(pendingById.has(current.id) && sameValues(result, pendingById.get(current.id)!))) {
      items.push({ kind: 'changed', result, current });
    }
  }
  return items;
}

export type CheckOutcome =
  | { kind: 'found'; items: FoundItem[] }
  | { kind: 'none' }
  | { kind: 'rate_limited'; retryAt: string }
  | { kind: 'unavailable' };

export type ImportOutcome = { kind: 'imported'; count: number } | { kind: 'failed' };

type Dependencies = { service: OfficialResultsService; repository: ImportedResultsRepository };

export function createOfficialUpdate({ service, repository }: Dependencies) {
  let running: Promise<CheckOutcome> | null = null;

  async function run(athleteId: string): Promise<CheckOutcome> {
    try {
      const outcome = await service.refresh(athleteId);
      if (!outcome.ok) return outcome.error.code === 'rate_limited' ? { kind: 'rate_limited', retryAt: outcome.error.retryAt } : { kind: 'unavailable' };
      const [imported, pending] = await Promise.all([repository.listByAthlete(athleteId), repository.listPendingChanges(athleteId)]);
      const items = sortOutFound(outcome.value, imported, pending);
      return items.length === 0 ? { kind: 'none' } : { kind: 'found', items };
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
      const unique = [...new Map(chosen.map((result) => [result.sourceResultKey, result])).values()];
      if (unique.length === 0) return { kind: 'imported', count: 0 };
      try {
        const outcome = await service.importChosen(athleteId, unique);
        return outcome.ok ? { kind: 'imported', count: unique.length } : { kind: 'failed' };
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
