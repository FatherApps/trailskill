import type { FamilyMeasurement } from '../data/familyMeasurements';
import { officialValue, type OfficialImport } from '../domain/officialValue';

// Noon UTC is the same calendar day in every time zone the tests run in (UTC-11 to UTC+11).
const competition: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FL',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'competition',
  competition: null,
  capturedAt: '2026-11-08T12:00:00.000Z',
  millis: 47_210,
  splits: [],
  officialMillis: 42_710,
  officialSetAt: '2026-11-08T13:00:00.000Z',
};

const imported: OfficialImport = { id: 'r1', provider: 'co-fecna', stroke: 'FL', distance: '50m', pool: 'SCM', hundredths: 4271, swumOn: '2026-11-08' };

describe('officialValue', () => {
  it('uses the imported result of the same event and day over the hand-typed one', () => {
    expect(officialValue(competition, [imported])).toEqual({ kind: 'imported', hundredths: 4271, provider: 'co-fecna', importedId: 'r1' });
  });

  it('keeps the hand-typed official time until an import matches', () => {
    expect(officialValue(competition, [{ ...imported, swumOn: '2026-11-07' }])).toEqual({ kind: 'manual', millis: 42_710 });
    expect(officialValue(competition, [{ ...imported, pool: 'LCM' }])).toEqual({ kind: 'manual', millis: 42_710 });
    expect(officialValue(competition, [{ ...imported, hundredths: null }])).toEqual({ kind: 'manual', millis: 42_710 });
  });

  it('never gives training an official value', () => {
    expect(officialValue({ ...competition, sessionType: 'training', officialMillis: null }, [imported])).toBeNull();
  });

  it('has none without an import or a hand-typed time', () => {
    expect(officialValue({ ...competition, officialMillis: null }, [])).toBeNull();
  });

  it('picks the swim closest to the measured time when several match that day', () => {
    const heat = { ...imported, id: 'heat', hundredths: 4400 };
    const final = { ...imported, id: 'final', hundredths: 4280 };
    expect(officialValue({ ...competition, officialMillis: null }, [heat, final])).toMatchObject({ importedId: 'heat' });
    expect(officialValue(competition, [heat, final])).toMatchObject({ importedId: 'final' });
  });
});
