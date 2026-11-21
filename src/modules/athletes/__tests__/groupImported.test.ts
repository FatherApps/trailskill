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
  ...over,
});

const group = (results: ImportedHistoryResult[]) => groupImportedResults(results, names, sessionDated);

describe('groupImportedResults', () => {
  it('shows the same result of two sources as one, listing both sources', () => {
    const grouped = group([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3012)]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceName).toBe('Federación Demo · Torneo Demo');
  });

  it('keeps two results when the time differs, without overwriting either', () => {
    const grouped = group([swim('a', 'xx-fed', '2026-05-10', 3012), swim('b', 'xx-tour', '2026-05-10', 3020)]);
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
});
