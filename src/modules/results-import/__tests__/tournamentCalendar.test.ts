import { catalogYears, countByDateKey, monthGrid, shiftMonth, yearOfKey } from '../data/tournamentCalendar';
import { groupTournaments, type TournamentCatalogEntry } from '../data/tournamentCatalog';

// Synthetic data only.
const entry = (id: string, dateKey: string, city = 'Ciudad Sintética'): TournamentCatalogEntry => ({
  id,
  organizationId: 'org-platform',
  year: Number(dateKey.slice(0, 4)),
  dateKey,
  name: `Torneo ${id}`,
  city,
  discipline: 'swimming',
  course: null,
  sourceUrl: null,
  refreshedAt: '2026-11-21T00:00:00Z',
});

describe('catalogYears', () => {
  it('lists the distinct years of the catalog, newest first', () => {
    const entries = [entry('a', '20251018'), entry('b', '20260510'), entry('c', '20260511')];
    expect(catalogYears(entries)).toEqual([2026, 2025]);
  });

  it('lists a new year as soon as its rows are in the catalog', () => {
    const entries = [entry('a', '20260510')];
    expect(catalogYears(entries)).toEqual([2026]);
    expect(catalogYears([...entries, entry('b', '20270110')])).toEqual([2027, 2026]);
  });

  it('has no year for an empty catalog', () => {
    expect(catalogYears([])).toEqual([]);
  });
});

describe('countByDateKey', () => {
  it('counts the tournaments of each day', () => {
    const counts = countByDateKey([entry('a', '20261018'), entry('b', '20261018'), entry('c', '20261019')]);
    expect(counts).toEqual({ '20261018': 2, '20261019': 1 });
  });
});

describe('monthGrid', () => {
  it('starts on Monday and pads the first and last week with nulls', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const weeks = monthGrid(2026, 10);
    expect(weeks[0]).toEqual([null, null, null, '20261001', '20261002', '20261003', '20261004']);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.at(-1)?.at(-1)).toBeNull();
  });

  it('knows a leap February', () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2027, 2).flat().filter(Boolean)).toHaveLength(28);
  });
});

describe('shiftMonth', () => {
  it('crosses the year in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, 1)).toEqual({ year: 2026, month: 6 });
  });
});

describe('yearOfKey', () => {
  it('is the year of a date key', () => {
    expect(yearOfKey('20251018')).toBe(2025);
  });
});

describe('groupTournaments by day', () => {
  const entries = [entry('a', '20261018'), entry('b', '20261018', 'Otra Ciudad'), entry('c', '20261019')];

  it('keeps only the tournaments of that date key', () => {
    const groups = groupTournaments(entries, { dateKey: '20261018' });
    expect(groups.flatMap((group) => group.tournaments.map((tournament) => tournament.id))).toEqual(['a', 'b']);
  });

  it('combines with the text and the year', () => {
    expect(groupTournaments(entries, { dateKey: '20261018', text: 'otra' }).flatMap((g) => g.tournaments.map((x) => x.id))).toEqual(['b']);
    expect(groupTournaments(entries, { dateKey: '20261018', year: 2025 })).toEqual([]);
  });

  it('shows a day with no tournaments as no groups', () => {
    expect(groupTournaments(entries, { dateKey: '20261020' })).toEqual([]);
  });
});
