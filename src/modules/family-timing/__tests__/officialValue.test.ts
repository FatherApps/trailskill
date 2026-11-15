import type { FamilyMeasurement } from '../data/familyMeasurements';
import { officialMatches, officialResultKeyOf, officialValue, type OfficialImport } from '../domain/officialValue';

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

  it('picks no result on its own when several match that day: the person chooses (decision 15)', () => {
    const heat = { ...imported, id: 'heat', hundredths: 4400 };
    const final = { ...imported, id: 'final', hundredths: 4280 };
    expect(officialValue({ ...competition, officialMillis: null }, [heat, final])).toBeNull();
    expect(officialValue(competition, [heat, final])).toEqual({ kind: 'manual', millis: 42_710 });
  });
});

describe('officialMatches (issue 974)', () => {
  const heat: OfficialImport = { ...imported, id: 'heat', sourceResultKey: 'k-heat', hundredths: 4400 };
  const final: OfficialImport = { ...imported, id: 'final', sourceResultKey: 'k-final', hundredths: 4280 };
  const first = { ...competition, id: 'first', officialMillis: null, capturedAt: '2026-11-08T10:00:00.000Z' };
  const second = { ...competition, id: 'second', officialMillis: null, capturedAt: '2026-11-08T16:00:00.000Z' };

  it('gives the only result of the event and day to its only time, with nothing to choose', () => {
    expect(officialMatches([first], [heat]).get('first')).toEqual({
      value: { kind: 'imported', hundredths: 4400, provider: 'co-fecna', importedId: 'heat' },
      choices: [],
      chosen: true,
    });
  });

  it('asks which result goes with each time when two times and two results share the event and day', () => {
    const matches = officialMatches([first, second], [heat, final]);
    for (const id of ['first', 'second']) {
      expect(matches.get(id)).toMatchObject({ value: null, chosen: false });
      expect(matches.get(id)?.choices.map((c) => c.id)).toEqual(['final', 'heat']);
    }
  });

  it('asks too when one result could go with either of two times', () => {
    const matches = officialMatches([first, second], [heat]);
    expect(matches.get('first')).toMatchObject({ value: null, chosen: false });
    expect(matches.get('first')?.choices.map((c) => c.id)).toEqual(['heat']);
  });

  it('keeps the chosen result with its time, uses it once, and gives the last result to the last time', () => {
    const matches = officialMatches([{ ...first, officialResultKey: officialResultKeyOf(final) }, second], [heat, final]);
    expect(matches.get('first')).toMatchObject({ value: { importedId: 'final' }, chosen: true });
    expect(matches.get('second')).toMatchObject({ value: { importedId: 'heat' }, chosen: true });
    // Either can still be changed among its own result and the free ones (none are left).
    expect(matches.get('second')?.choices.map((c) => c.id)).toEqual(['heat']);
  });

  it('gives a result chosen for two times to the earlier one only', () => {
    const key = officialResultKeyOf(final);
    const matches = officialMatches([{ ...second, officialResultKey: key }, { ...first, officialResultKey: key }], [heat, final]);
    expect(matches.get('first')).toMatchObject({ value: { importedId: 'final' } });
    expect(matches.get('second')).toMatchObject({ value: { importedId: 'heat' } });
  });

  it('keeps the choice when the source publishes a corrected revision with a new id', () => {
    const corrected = { ...final, id: 'final-rev-2', hundredths: 4279 };
    const matches = officialMatches([{ ...first, officialResultKey: officialResultKeyOf(final) }, second], [heat, corrected]);
    expect(matches.get('first')).toMatchObject({ value: { importedId: 'final-rev-2', hundredths: 4279 } });
  });

  it('keeps the hand-typed official time of a time still waiting for a choice', () => {
    expect(officialMatches([{ ...first, officialMillis: 44_010 }, second], [heat, final]).get('first')).toMatchObject({
      value: { kind: 'manual', millis: 44_010 },
      chosen: false,
    });
  });

  it('leaves training and other events out', () => {
    const training = { ...first, id: 'training', sessionType: 'training' as const };
    const other = { ...first, id: 'other', stroke: 'BK' as const };
    const matches = officialMatches([training, other], [heat]);
    expect(matches.get('training')).toEqual({ value: null, choices: [], chosen: false });
    expect(matches.get('other')).toEqual({ value: null, choices: [], chosen: false });
  });
});
