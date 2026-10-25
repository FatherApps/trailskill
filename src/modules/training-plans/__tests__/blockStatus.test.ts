import { blockSummary } from '../components/blockSummary';
import { nextStatus, statusLabel, statusTag } from '../components/blockStatus';
import { plansFixture } from '../__fixtures__/plans';
import { blockStatuses, phases, recordings } from '../types';

describe('blockStatus', () => {
  it('cycles done → partial → absent → not_marked → done', () => {
    expect(nextStatus('done')).toBe('partial');
    expect(nextStatus('partial')).toBe('absent');
    expect(nextStatus('absent')).toBe('not_marked');
    expect(nextStatus('not_marked')).toBe('done');
    expect(blockStatuses).toEqual(['done', 'partial', 'absent', 'not_marked']);
  });

  it('maps every status to its tag', () => {
    expect(statusTag({ status: 'done', repetitions: 4 })).toEqual({ variant: 'ok', icon: 'check', label: 'Hecho' });
    expect(statusTag({ status: 'partial', completedRepetitions: 3, repetitions: 8 })).toEqual({
      variant: 'warn',
      icon: 'incomplete_circle',
      label: 'Parcial · 3 de 8',
    });
    expect(statusTag({ status: 'absent', repetitions: 4 })).toEqual({ variant: 'neutral', icon: 'close', label: 'No asistió' });
    expect(statusTag({ status: 'not_marked', repetitions: 4 })).toEqual({
      variant: 'outline',
      icon: 'radio_button_unchecked',
      label: 'Sin marcar',
    });
  });

  it('shows a partial without a count as just "Parcial"', () => {
    expect(statusTag({ status: 'partial', repetitions: 8 }).label).toBe('Parcial');
    expect(statusLabel({ status: 'partial', repetitions: 8 })).toBe('Parcial');
  });

  it('keeps a zero count as a count', () => {
    expect(statusLabel({ status: 'partial', completedRepetitions: 0, repetitions: 8 })).toBe('Parcial · 0 de 8');
  });
});

describe('shared lists and summary', () => {
  it('lists phases and recordings in display order', () => {
    expect(phases).toEqual(['warm_up', 'main', 'technique', 'cool_down']);
    expect(recordings).toEqual(['completion', 'per_repetition', 'series_total']);
  });

  it('builds the block summary with the vocabulary label', () => {
    expect(blockSummary(plansFixture.blocks[1], plansFixture.vocabulary)).toBe('8 × 50 m Libre');
  });
});
