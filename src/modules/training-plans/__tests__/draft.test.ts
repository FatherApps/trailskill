import { blockErrors, newDraftBlock, toPlanBlock, type DraftBlock } from '../draft';
import { MAX_DRILL_LENGTH } from '../data/plans';
import { planVocabulary } from '../vocabulary';

const vocabulary = planVocabulary();
const complete: DraftBlock = { ...newDraftBlock('b1', vocabulary), activity: 'FR', recording: 'completion' };

describe('planVocabulary', () => {
  it('takes strokes, equipment and distances from the sport catalogs', () => {
    expect(vocabulary.activities).toEqual([
      { value: 'FR', label: 'Libre' },
      { value: 'BK', label: 'Espalda' },
      { value: 'BR', label: 'Pecho' },
      { value: 'FL', label: 'Mariposa' },
      { value: 'IM', label: 'Combinado' },
    ]);
    expect(vocabulary.equipment.map((option) => option.value)).toEqual(['fins', 'paddles', 'snorkel', 'kickboard', 'pull_buoy']);
    expect(vocabulary.equipment[3]).toEqual({ value: 'kickboard', label: 'Tabla' });
    expect(vocabulary.distances).toEqual([25, 50, 100, 200, 400, 800, 1500]);
  });
});

describe('newDraftBlock', () => {
  it('starts with nothing chosen for the activity and what is recorded', () => {
    expect(newDraftBlock('x', vocabulary)).toEqual({
      id: 'x',
      phase: 'main',
      repetitions: 1,
      distance: 25,
      activity: '',
      equipment: [],
      sendOffSeconds: null,
      recording: null,
    });
  });
});

describe('blockErrors', () => {
  it('has no errors for a complete block', () => {
    expect(blockErrors(complete, vocabulary)).toEqual({});
  });

  it('requires an activity and what is recorded', () => {
    expect(blockErrors(newDraftBlock('x', vocabulary), vocabulary)).toEqual({ activity: 'required', recording: 'required' });
  });

  it('treats a blank drill as missing', () => {
    expect(blockErrors({ ...complete, activity: '   ' }, vocabulary)).toEqual({ activity: 'required' });
  });

  it('accepts a drill up to the limit and rejects a longer one', () => {
    expect(blockErrors({ ...complete, activity: 'a'.repeat(MAX_DRILL_LENGTH) }, vocabulary)).toEqual({});
    expect(blockErrors({ ...complete, activity: 'a'.repeat(MAX_DRILL_LENGTH + 1) }, vocabulary)).toEqual({ activity: 'too_long' });
  });
});

describe('toPlanBlock', () => {
  it('returns the block with its recording', () => {
    expect(toPlanBlock(complete)).toEqual({ ...complete, recording: 'completion' });
  });

  it('refuses a block without what is recorded', () => {
    expect(() => toPlanBlock({ ...complete, recording: null })).toThrow();
  });
});
