import { createCoColombiaacuatica } from '../index.ts';
import { TOURNAMENT_PDF, isTournamentKey } from '../lookup.ts';
import seed from '../tournaments-2024-2025.json' with { type: 'json' };

// The reviewed catalog the platform brings with it: only tournament metadata, in the exact shape of the list, sorted and without repeats.
describe('tournaments-2024-2025.json', () => {
  const rows = seed as Record<string, unknown>[];

  it('is what the adapter brings with it', () => {
    expect(createCoColombiaacuatica().seedTournaments).toEqual(seed);
  });

  it('is sorted by date_key, with one row per day', () => {
    const keys = rows.map((row) => row.dateKey as string);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has in every row the fields of a list entry and nothing else', () => {
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['city', 'course', 'dateKey', 'discipline', 'name', 'sourceUrl', 'year']);
      expect([2024, 2025]).toContain(row.year);
      expect(isTournamentKey(row.year as number, row.dateKey as string)).toBe(true);
      expect(row.course).toBeNull();
      for (const field of ['name', 'city', 'discipline'] as const) {
        expect(typeof row[field] === 'string' && (row[field] as string).trim() === row[field] && row[field] !== '').toBe(true);
      }
      expect(TOURNAMENT_PDF.exec(row.sourceUrl as string)?.slice(1)).toEqual([String(row.year), row.dateKey]);
    }
  });
});
