import type { Hundredths } from '../../../core/time';
import { importedAchievement, type ImportedHistoryResult } from '../achievements';
import { groupImportedResults } from '../groupImported';
import { personalBest } from '../personalBest';

// Synthetic: fictional providers and times.
const names = { 'xx-fed': 'Federación Demo', 'xx-tour': 'Torneo Demo' };
const sessionDated = ['xx-tour'];
const federation = ['xx-fed'];

const swim = (id: string, provider: string, swumOn: string, hundredths: number | null, over: Partial<ImportedHistoryResult> = {}): ImportedHistoryResult => ({
  id,
  provider,
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  hundredths: hundredths as Hundredths | null,
  swumOn,
  competition: null,
  ...over,
});

const group = (results: ImportedHistoryResult[]) => groupImportedResults(results, names, sessionDated);

describe('groupImportedResults', () => {
  it('shows the same result of two sources as one, listing both sources', () => {
    const grouped = group([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceName).toBe('Federación Demo · Torneo Demo');
  });

  it('keeps two results when the time differs beyond the tolerance, without overwriting either', () => {
    const grouped = group([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3023)]);
    expect(grouped.map((g) => [g.result.id, g.sourceName])).toEqual([
      ['a', 'Federación Demo'],
      ['b', 'Torneo Demo'],
    ]);
  });

  it('never groups a missing time: two nulls of the same day stay two', () => {
    expect(group([swim('a', 'xx-fed', '2026-05-10', null), swim('b', 'xx-tour', '2026-05-10', null)])).toHaveLength(2);
  });

  it('does not group another event, stroke, distance or pool', () => {
    const other = [{ stroke: 'BK' as const }, { distance: '100m' as const }, { pool: 'LCM' as const }];
    for (const over of other) {
      expect(group([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3012, over)])).toHaveLength(2);
    }
  });

  it('groups different sources up to 3 days apart and shows the session date of the platform', () => {
    const two = group([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)]);
    expect(two).toHaveLength(1);
    expect(two[0].result).toMatchObject({ id: 'b', swumOn: '2026-05-10' });
    expect(group([swim('a', 'xx-fed', '2026-05-07', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)])).toHaveLength(1);
  });

  it('shows the whole federation result (date, time, id) when the group holds one, listing both sources', () => {
    const grouped = groupImportedResults([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)], names, sessionDated, federation);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].result).toMatchObject({ id: 'a', provider: 'xx-fed', swumOn: '2026-05-08', hundredths: 3012 });
    expect(grouped[0].sourceName).toBe('Federación Demo · Torneo Demo');
  });

  it('carries the competition name of the shown result: the federation one when the group holds both (issue 1358)', () => {
    const results = [swim('a', 'xx-fed', '2026-05-08', 3012, { competition: 'Torneo de prueba' }), swim('b', 'xx-tour', '2026-05-10', 3012, { competition: 'Copa sintética' })];
    const [shown] = groupImportedResults(results, names, sessionDated, federation);
    expect(importedAchievement(shown.result, shown.sourceName)).toMatchObject({ id: 'a', competition: 'Torneo de prueba' });
  });

  it('leaves the competition out of the achievement when the shown result has no name (null or empty)', () => {
    expect(importedAchievement(swim('a', 'xx-fed', '2026-05-08', 3012))).not.toHaveProperty('competition');
    expect(importedAchievement(swim('a', 'xx-fed', '2026-05-08', 3012, { competition: '' }))).not.toHaveProperty('competition');
  });

  it('shows the federation result whichever source is older or listed first', () => {
    const grouped = groupImportedResults([swim('a', 'xx-tour', '2026-05-08', 3012), swim('b', 'xx-fed', '2026-05-10', 3012)], names, sessionDated, federation);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].result).toMatchObject({ id: 'b', swumOn: '2026-05-10' });
  });

  it('keeps the session-dated result when the group holds no federation result, as before', () => {
    const grouped = groupImportedResults([swim('a', 'xx-other', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)], names, sessionDated, federation);
    expect(grouped[0].result).toMatchObject({ id: 'b' });
  });

  it('gives the same result without the fourth parameter as with an empty one', () => {
    const results = [swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)];
    expect(groupImportedResults(results, names, sessionDated)).toEqual(groupImportedResults(results, names, sessionDated, []));
    expect(groupImportedResults(results, names, sessionDated)[0].result.id).toBe('b');
  });

  it('does not change the joining window: a federation result 4 days away stays apart', () => {
    const grouped = groupImportedResults([swim('a', 'xx-fed', '2026-05-06', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)], names, sessionDated, federation);
    expect(grouped.map((g) => g.result.id)).toEqual(['a', 'b']);
  });

  it('takes the personal best date from the federation result', () => {
    const best = personalBest(
      groupImportedResults([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)], names, sessionDated, federation).map(({ result, sourceName }) => importedAchievement(result, sourceName)),
    );
    expect(best).toMatchObject({ id: 'a', date: '2026-05-08' });
  });

  it('keeps two results from different sources 4 days apart', () => {
    expect(group([swim('a', 'xx-fed', '2026-05-06', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)])).toHaveLength(2);
  });

  it('keeps the date exact inside one source: the same time on other days stays two', () => {
    expect(group([swim('a', 'xx-fed', '2026-05-09', 3012), swim('b', 'xx-fed', '2026-05-10', 3012)])).toHaveLength(2);
  });

  it('joins the same source on the same day into one result with one source', () => {
    const grouped = group([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-fed', '2026-05-10', 3012)]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceName).toBe('Federación Demo');
  });

  it('keeps every result when no source name is known', () => {
    const grouped = groupImportedResults([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)], {}, []);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceName).toBeUndefined();
  });

  it('leaves the personal best the same with one source or with both', () => {
    const best = (results: ImportedHistoryResult[]) =>
      personalBest(group(results).map(({ result, sourceName }) => importedAchievement(result, sourceName)))?.hundredths;
    const fed = swim('a', 'xx-fed', '2026-05-08', 3012);
    expect(best([fed])).toBe(3012);
    expect(best([fed, swim('b', 'xx-tour', '2026-05-10', 3012)])).toBe(3012);
  });

  describe('validated by the federation (issue 1470)', () => {
    const grouped = (results: ImportedHistoryResult[]) => groupImportedResults(results, names, sessionDated, federation);

    it('is validated when the group holds a federation and a platform source, and names the federation from data', () => {
      const [one, ...rest] = grouped([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)]);
      expect(rest).toHaveLength(0);
      expect(one).toMatchObject({ validated: true, federationName: 'Federación Demo' });
      expect(one.result).toMatchObject({ id: 'a', swumOn: '2026-05-08', hundredths: 3012 });
    });

    it('is not validated with a single source, nor with a federation and an unlisted source', () => {
      expect(grouped([swim('a', 'xx-fed', '2026-05-08', 3012)])[0].validated).toBe(false);
      expect(grouped([swim('b', 'xx-tour', '2026-05-10', 3012)])[0]).toMatchObject({ validated: false });
      expect(grouped([swim('b', 'xx-tour', '2026-05-10', 3012)])[0].federationName).toBeUndefined();
      expect(grouped([swim('a', 'xx-fed', '2026-05-08', 3012), swim('c', 'xx-other', '2026-05-08', 3012)])[0].validated).toBe(false);
    });

    it('joins sources up to 0.10 s apart when each is the only candidate of the other, and not at 0.11 s', () => {
      const near = grouped([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3022)]);
      expect(near).toHaveLength(1);
      expect(near[0]).toMatchObject({ validated: true });
      expect(near[0].result.id).toBe('a');
      expect(grouped([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3023)])).toHaveLength(2);
      expect(grouped([swim('a', 'xx-fed', '2026-05-08', 3022), swim('b', 'xx-tour', '2026-05-10', 3012)])).toHaveLength(1);
    });

    it('does not join by tolerance outside the 3 days, another event, or the same source', () => {
      expect(grouped([swim('a', 'xx-fed', '2026-05-06', 3012), swim('b', 'xx-tour', '2026-05-10', 3015)])).toHaveLength(2);
      expect(grouped([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3015, { stroke: 'BK' })])).toHaveLength(2);
      expect(grouped([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-fed', '2026-05-10', 3015)])).toHaveLength(2);
    });

    it('never joins a missing time by tolerance', () => {
      expect(grouped([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', null)])).toHaveLength(2);
    });

    it('asks for the exact time when a side has two candidates within the tolerance', () => {
      // Two platform rows near the federation one: neither joins.
      const two = grouped([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3015), swim('c', 'xx-tour', '2026-05-09', 3018)]);
      expect(two).toHaveLength(3);
      expect(two.every((g) => !g.validated)).toBe(true);
      // The same with the extra candidate on the federation side.
      expect(grouped([swim('a', 'xx-fed', '2026-05-10', 3012), swim('d', 'xx-fed', '2026-05-09', 3016), swim('b', 'xx-tour', '2026-05-10', 3015)])).toHaveLength(3);
    });

    it('joins only the exact pair when another candidate is within the tolerance', () => {
      const result = grouped([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3012), swim('c', 'xx-tour', '2026-05-09', 3015)]);
      expect(result).toHaveLength(2);
      expect(result.filter((g) => g.validated).map((g) => g.result.id)).toEqual(['a']);
    });

    it('joins two separate pairs independently', () => {
      const result = grouped([
        swim('a', 'xx-fed', '2026-05-10', 3012),
        swim('b', 'xx-tour', '2026-05-10', 3015),
        swim('c', 'xx-fed', '2026-05-10', 6000, { distance: '100m' }),
        swim('d', 'xx-tour', '2026-05-10', 6004, { distance: '100m' }),
      ]);
      expect(result).toHaveLength(2);
      expect(result.every((g) => g.validated)).toBe(true);
    });

    it('counts a validated group once in the personal best', () => {
      const best = personalBest(grouped([swim('a', 'xx-fed', '2026-05-08', 3012), swim('b', 'xx-tour', '2026-05-10', 3020)]).map(({ result, sourceName }) => importedAchievement(result, sourceName)));
      expect(best).toMatchObject({ id: 'a', hundredths: 3012 });
    });
  });
});
