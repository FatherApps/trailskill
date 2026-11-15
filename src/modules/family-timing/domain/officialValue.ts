import type { Hundredths, Millis } from '../../../core/time';
import type { FamilyMeasurement } from '../data/familyMeasurements';
import { localDay } from './localDay';

/** The imported fields this module needs; the results-import module owns the full type. */
export type OfficialImport = {
  id: string;
  provider: string;
  // The result's key at its source: it stays the same when the source publishes a correction (a new revision, a new id).
  sourceResultKey?: string;
  stroke: string;
  distance: string;
  pool: string;
  hundredths: Hundredths | null;
  swumOn: string; // yyyy-mm-dd
  competition?: string | null;
};

export type OfficialValue =
  | { kind: 'imported'; hundredths: Hundredths; provider: string; importedId: string }
  | { kind: 'manual'; millis: Millis }
  | null;

type Candidate = OfficialImport & { hundredths: Hundredths };

/**
 * What a measurement's official time is, and which imported results the person may still pick for it (decision 15 of the plan):
 * `choices` is empty when nothing is left to decide.
 */
export type OfficialMatch = { value: OfficialValue; choices: Candidate[]; chosen: boolean };

/** How a chosen imported result is remembered on the measurement: by its source and key, so a corrected revision keeps the choice. */
export function officialResultKeyOf(r: Pick<OfficialImport, 'id' | 'provider' | 'sourceResultKey'>): string {
  return `${r.provider}:${r.sourceResultKey ?? r.id}`;
}

const eventOf = (day: string, r: { stroke: string; distance: string; pool: string }) => `${day}|${r.stroke}|${r.distance}|${r.pool}`;
const imported = (r: Candidate): OfficialValue => ({ kind: 'imported', hundredths: r.hundredths, provider: r.provider, importedId: r.id });
const manual = (m: FamilyMeasurement): OfficialValue => (m.officialMillis !== null ? { kind: 'manual', millis: m.officialMillis } : null);

/**
 * The official value of each of a swimmer's measurements:
 * - training never has one, and its captured time stays as it is;
 * - a competition time takes an imported official result of the same event (stroke, distance, pool) swum the same local day,
 *   which wins over a hand-typed official time. Each imported result goes with one time at most;
 * - the result the person chose for the time stays with it;
 * - one time and one result of that event and day go together, and so do the last ones once the person chose for the others;
 * - with more of either (heats and finals, two people timing the same swim), the person picks: the time keeps its hand-typed official
 *   time, if any, and lists the results nobody took yet;
 * - otherwise the hand-typed official time, if any.
 * With an official value the captured competition time is history, never official.
 */
export function officialMatches(measurements: readonly FamilyMeasurement[], imports: readonly OfficialImport[]): Map<string, OfficialMatch> {
  const result = new Map<string, OfficialMatch>();
  const candidatesByEvent = new Map<string, Candidate[]>();
  for (const r of imports) {
    if (r.hundredths === null) continue;
    const key = eventOf(r.swumOn, r);
    candidatesByEvent.set(key, [...(candidatesByEvent.get(key) ?? []), r as Candidate]);
  }
  const timesByEvent = new Map<string, FamilyMeasurement[]>();
  for (const m of measurements) {
    if (m.sessionType !== 'competition') {
      result.set(m.id, { value: null, choices: [], chosen: false });
      continue;
    }
    const key = eventOf(localDay(m.capturedAt), m);
    timesByEvent.set(key, [...(timesByEvent.get(key) ?? []), m]);
  }

  for (const [key, times] of timesByEvent) {
    const candidates = [...(candidatesByEvent.get(key) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 0) {
      for (const m of times) result.set(m.id, { value: manual(m), choices: [], chosen: false });
      continue;
    }
    // The person's choices first, oldest time first so two times that point at one result give it to the same one every time.
    const ordered = [...times].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
    const taken = new Map<string, Candidate>();
    const free = new Set(candidates.map((c) => c.id));
    for (const m of ordered) {
      const choice = m.officialResultKey ? candidates.find((c) => free.has(c.id) && officialResultKeyOf(c) === m.officialResultKey) : undefined;
      if (choice) {
        taken.set(m.id, choice);
        free.delete(choice.id);
      }
    }
    const open = ordered.filter((m) => !taken.has(m.id));
    const left = candidates.filter((c) => free.has(c.id));
    const ambiguous = times.length > 1 || candidates.length > 1;
    // One time and one result go together; so do the last time and the last result once the person chose the others.
    if (open.length === 1 && left.length === 1 && (!ambiguous || taken.size > 0)) {
      taken.set(open[0]!.id, left[0]!);
      free.delete(left[0]!.id);
    }
    const stillFree = candidates.filter((c) => free.has(c.id));
    for (const m of times) {
      const own = taken.get(m.id);
      // With more than one time or result, the person can change what goes with each time, among their own and the free ones.
      const choices = ambiguous ? [...(own ? [own] : []), ...stillFree].sort((a, b) => a.id.localeCompare(b.id)) : [];
      result.set(m.id, { value: own ? imported(own) : manual(m), choices, chosen: own !== undefined });
    }
  }
  return result;
}

/** The official value of one measurement on its own; see officialMatches. */
export function officialValue(m: FamilyMeasurement, imports: readonly OfficialImport[]): OfficialValue {
  return officialMatches([m], imports).get(m.id)?.value ?? null;
}
