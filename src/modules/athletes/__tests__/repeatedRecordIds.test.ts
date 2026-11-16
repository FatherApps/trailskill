import { repeatedRecordIds } from '../repeatedRecordIds';

// Synthetic data only.
const row = (id: string, origin: string, kind = 'race') => ({ id, origin, value: { kind } });

describe('repeatedRecordIds', () => {
  it('returns nothing when every id appears once', () => {
    expect(repeatedRecordIds([row('a', 'own'), row('b', 'import')])).toEqual([]);
  });

  it('names the id and where each of its rows came from', () => {
    expect(repeatedRecordIds([row('a', 'own'), row('b', 'import'), row('a', 'import'), row('a', 'other_school', 'series_total')])).toEqual([
      { id: 'a', sources: ['own/race', 'import/race', 'other_school/series_total'] },
    ]);
  });
});
