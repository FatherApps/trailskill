import { athleteIndicators, filterAthletes, filterOptions, startOfWeek } from '../data/athletesList';
import type { ConsoleAthlete } from '../data/consoleAthletes';

// Synthetic data only.
function athlete(id: string, name: string, over: Partial<ConsoleAthlete> = {}): ConsoleAthlete {
  return {
    id,
    name,
    initials: name
      .split(' ')
      .map((word) => word[0])
      .join(''),
    color: 'athlete-1',
    categoryId: null,
    category: null,
    categorySortOrder: null,
    groupIds: [],
    groups: [],
    coachIds: [],
    authorization: 'valid',
    bestTime: null,
    ...over,
  };
}

const list: ConsoleAthlete[] = [
  athlete('a1', 'Lucía Ramírez', { categoryId: 'c2', category: 'Infantil B', categorySortOrder: 2, groupIds: ['g1'], groups: ['Group A'], coachIds: ['k1'] }),
  athlete('a2', 'Mateo Castro', { categoryId: 'c2', category: 'Infantil B', categorySortOrder: 2, groupIds: ['g2'], groups: ['Group B'], coachIds: ['k2'], authorization: 'pending' }),
  athlete('a3', 'Lucas Peña', { categoryId: 'c1', category: 'Infantil A', categorySortOrder: 1, groupIds: ['g1', 'g2'], groups: ['Group A', 'Group B'], coachIds: ['k1', 'k2'] }),
  athlete('a4', 'Sara Peña', { authorization: 'pending' }),
];
const ids = (athletes: ConsoleAthlete[]) => athletes.map((a) => a.id);

describe('filterAthletes', () => {
  it('returns the whole list for an empty query and no filters', () => {
    expect(ids(filterAthletes(list, '', {}))).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(ids(filterAthletes(list, '   ', {}))).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('matches a substring of the full name, ignoring case', () => {
    expect(ids(filterAthletes(list, 'PEÑA', {}))).toEqual(['a3', 'a4']);
    expect(ids(filterAthletes(list, 'a r', {}))).toEqual(['a1']);
  });

  it('trims the query', () => {
    expect(ids(filterAthletes(list, '  mateo ', {}))).toEqual(['a2']);
  });

  it('ignores accents in the query and in the name', () => {
    expect(ids(filterAthletes(list, 'lucia', {}))).toEqual(['a1']);
    expect(ids(filterAthletes(list, 'RAMÍREZ', {}))).toEqual(['a1']);
    expect(ids(filterAthletes(list, 'pena', {}))).toEqual(['a3', 'a4']);
  });

  it('filters by category id', () => {
    expect(ids(filterAthletes(list, '', { category: 'c2' }))).toEqual(['a1', 'a2']);
  });

  it('filters by group id, matching any of the groups of the athlete', () => {
    expect(ids(filterAthletes(list, '', { group: 'g2' }))).toEqual(['a2', 'a3']);
  });

  it('filters by coach id, matching any of the coaches of the athlete', () => {
    expect(ids(filterAthletes(list, '', { coach: 'k1' }))).toEqual(['a1', 'a3']);
  });

  it('combines search, category, group and coach with AND, and clearing each widens the result', () => {
    const all = { category: 'c1', group: 'g2', coach: 'k1' };
    expect(ids(filterAthletes(list, 'luc', all))).toEqual(['a3']);
    expect(ids(filterAthletes(list, 'lucia', all))).toEqual([]);

    expect(ids(filterAthletes(list, 'luc', { group: 'g2', coach: 'k1' }))).toEqual(['a3']);
    expect(ids(filterAthletes(list, 'luc', { coach: 'k1' }))).toEqual(['a1', 'a3']);
    expect(ids(filterAthletes(list, 'luc', {}))).toEqual(['a1', 'a3']);
    expect(ids(filterAthletes(list, '', {}))).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('treats an undefined filter value as cleared', () => {
    expect(ids(filterAthletes(list, '', { category: undefined, coach: 'k2' }))).toEqual(['a2', 'a3']);
  });
});

describe('filterOptions', () => {
  it('lists only the values present in the list: categories by sort order, groups by label, coaches by id without label', () => {
    const options = filterOptions(list);

    expect(options.category).toEqual([
      { id: 'c1', label: 'Infantil A' },
      { id: 'c2', label: 'Infantil B' },
    ]);
    expect(options.group).toEqual([
      { id: 'g1', label: 'Group A' },
      { id: 'g2', label: 'Group B' },
    ]);
    expect(options.coach).toEqual([
      { id: 'k1', label: null },
      { id: 'k2', label: null },
    ]);
  });

  it('returns empty options for an empty list', () => {
    expect(filterOptions([])).toEqual({ category: [], group: [], coach: [] });
  });
});

describe('athleteIndicators', () => {
  it('counts the whole list, the pending authorizations and the week measurements; to review is unknown, never 0', () => {
    expect(athleteIndicators(list, 12)).toEqual({ active: 4, pendingAuthorization: 2, measurementsThisWeek: 12, toReview: null });
  });

  it('matches the list: a school without athletes has zeros but still no review count', () => {
    expect(athleteIndicators([], 0)).toEqual({ active: 0, pendingAuthorization: 0, measurementsThisWeek: 0, toReview: null });
  });

  it('is not affected by a filter on the list', () => {
    const filtered = filterAthletes(list, 'mateo', {});
    expect(athleteIndicators(list, 0).active).toBe(4);
    expect(athleteIndicators(filtered, 0).active).toBe(1);
  });
});

describe('startOfWeek', () => {
  const monday00 = (year: number, month: number, day: number) => new Date(year, month, day, 0, 0, 0, 0).toISOString();

  it('is the Monday 00:00 local time of a Wednesday', () => {
    expect(startOfWeek(new Date(2026, 9, 21, 15, 30))).toBe(monday00(2026, 9, 19));
  });

  it('keeps a Monday at 00:00 as it is', () => {
    expect(startOfWeek(new Date(2026, 9, 19, 0, 0, 0, 0))).toBe(monday00(2026, 9, 19));
  });

  it('belongs a Sunday to the week that started six days before', () => {
    expect(startOfWeek(new Date(2026, 9, 25, 23, 59))).toBe(monday00(2026, 9, 19));
  });

  it('crosses a month boundary', () => {
    expect(startOfWeek(new Date(2026, 10, 1, 10, 0))).toBe(monday00(2026, 9, 26));
  });
});
