import type { AthleteFilterId } from '../components/athleteTypes';
import type { ConsoleAthlete } from './consoleAthletes';

export type ConsoleIndicators = {
  active: number;
  pendingAuthorization: number;
  measurementsThisWeek: number;
  // Unknown: school admins cannot read conflicts yet (S10). A missing value is never 0.
  toReview: number | null;
};

export type FilterOption = { id: string; label: string | null };

const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Search (name substring, case and accent insensitive) and the filters (by id) combine with AND. */
export function filterAthletes(
  athletes: readonly ConsoleAthlete[],
  query: string,
  filters: Partial<Record<AthleteFilterId, string>>,
): ConsoleAthlete[] {
  const needle = plain(query.trim());
  return athletes.filter(
    (a) =>
      plain(a.name).includes(needle) &&
      (!filters.category || a.categoryId === filters.category) &&
      (!filters.group || a.groupIds.includes(filters.group)) &&
      (!filters.coach || a.coachIds.includes(filters.coach)),
  );
}

/** Only the values present in the list. Coaches have no label until their names are readable (issue 220). */
export function filterOptions(athletes: readonly ConsoleAthlete[]): Record<AthleteFilterId, FilterOption[]> {
  const categories = new Map<string, { label: string; sortOrder: number }>();
  const groups = new Map<string, string>();
  const coaches = new Set<string>();
  for (const a of athletes) {
    if (a.categoryId && a.category !== null) categories.set(a.categoryId, { label: a.category, sortOrder: a.categorySortOrder ?? 0 });
    a.groupIds.forEach((id, index) => groups.set(id, a.groups[index] ?? id));
    a.coachIds.forEach((id) => coaches.add(id));
  }
  return {
    category: [...categories]
      .sort(([idA, a], [idB, b]) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label) || idA.localeCompare(idB))
      .map(([id, { label }]) => ({ id, label })),
    group: [...groups].sort(([idA, a], [idB, b]) => a.localeCompare(b) || idA.localeCompare(idB)).map(([id, label]) => ({ id, label })),
    coach: [...coaches].sort().map((id) => ({ id, label: null })),
  };
}

/** Computed over the whole school list, not the filtered one. */
export function athleteIndicators(athletes: readonly ConsoleAthlete[], measurementsThisWeek: number): ConsoleIndicators {
  return {
    active: athletes.length,
    pendingAuthorization: athletes.filter((a) => a.authorization === 'pending').length,
    measurementsThisWeek,
    toReview: null,
  };
}

/** Monday 00:00 of the week of `now` in the device's local time, as ISO 8601. Sunday belongs to the week that started six days before. */
export function startOfWeek(now: Date): string {
  const sinceMonday = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday, 0, 0, 0, 0).toISOString();
}
