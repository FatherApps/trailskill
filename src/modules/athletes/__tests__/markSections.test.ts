import { importedAchievement } from '../achievements';
import { localDay, markFeatured, markSections } from '../markSections';
import { marksByEvent } from '../marks';
import { measured } from '../__fixtures__/marks';
import type { Hundredths } from '../../../core/time';

// Synthetic data only.
const cardOf = (sections: ReturnType<typeof markSections>, id: string) => sections.flatMap((section) => section.cards).find((card) => card.id === id)!;

describe('markSections', () => {
  const sections = markSections(marksByEvent([measured('FR', '50m', 3482, '2026-10-18'), measured('BK', '50m', 4108, '2026-10-02', { kind: 'repetition' })], 'SCM'));

  it('gives a card the distance alone, and the whole event for screen readers', () => {
    expect(cardOf(sections, 'FR-50m')).toMatchObject({ distance: '50 m', event: 'Libre 50 metros', stroke: 'FR' });
  });

  it('titles each group with the name of its stroke and keeps the stroke code', () => {
    expect(sections.map(({ id, title }) => [id, title])).toEqual([['FR', 'Libre'], ['BK', 'Espalda'], ['BR', 'Pecho'], ['FL', 'Mariposa'], ['IM', 'Combinado']]);
  });

  it('marks a measured race as competition and any other kind as training', () => {
    expect(cardOf(sections, 'FR-50m')).toMatchObject({ origin: 'competition', date: '2026-10-18' });
    expect(cardOf(sections, 'BK-50m')).toMatchObject({ origin: 'training', date: '2026-10-02' });
  });

  it('carries the organization of an official result from its data, never from code', () => {
    const imported = importedAchievement({ id: 'i1', provider: 'xx-demo', stroke: 'FR', distance: '100m', pool: 'SCM', hundredths: 7966 as Hundredths, swumOn: '2025-08-23' }, 'Federación Demo');
    const official = cardOf(markSections(marksByEvent([imported], 'SCM')), 'FR-100m');

    expect(official).toMatchObject({ origin: 'official', sourceName: 'Federación Demo' });
  });

  it('has no time, origin or date on an event with no mark', () => {
    expect(cardOf(sections, 'BR-50m')).toEqual({ id: 'BR-50m', stroke: 'BR', event: 'Pecho 50 metros', distance: '50 m', time: null });
  });

  it('shows a stroke outside the catalog under its own code instead of dropping it', () => {
    const unknown = markSections(marksByEvent([measured('XX' as never, '50m', 9000, '2026-10-18')], 'SCM'));

    expect(unknown.at(-1)).toMatchObject({ id: 'XX', title: 'XX' });
    expect(unknown.at(-1)?.cards[0]).toMatchObject({ stroke: 'XX', time: 9000 });
  });
});

describe('markFeatured', () => {
  const rows = marksByEvent([measured('FR', '50m', 3482, '2026-10-18'), measured('BK', '50m', 4108, '2026-10-02', { kind: 'repetition' })], 'SCM');

  it('describes the most recent mark: the event, the time, the origin and the date', () => {
    expect(markFeatured(rows, '2026-10-20')).toMatchObject({ id: 'FR-50m', stroke: 'FR', event: 'Libre 50 metros', title: 'Libre 50 m', time: 3482, origin: 'competition', date: '2026-10-18' });
  });

  it('marks it new on the 14th day since it was set, and not on the 15th', () => {
    expect(markFeatured(rows, '2026-11-01')?.isNew).toBe(true);
    expect(markFeatured(rows, '2026-11-02')?.isNew).toBe(false);
    expect(markFeatured(rows, '2026-10-18')?.isNew).toBe(true);
  });

  it('carries the organization of an official mark from its data', () => {
    const imported = importedAchievement({ id: 'i1', provider: 'xx-demo', stroke: 'FR', distance: '100m', pool: 'SCM', hundredths: 7966 as Hundredths, swumOn: '2026-10-19' }, 'Federación Demo');

    expect(markFeatured(marksByEvent([imported], 'SCM'), '2026-10-20')).toMatchObject({ origin: 'official', sourceName: 'Federación Demo' });
  });

  it('is null when there are no marks, so no card is shown', () => {
    expect(markFeatured(marksByEvent([], 'SCM'), '2026-10-20')).toBeNull();
  });
});

describe('localDay', () => {
  it('is the calendar day on the device, not the UTC one', () => {
    expect(localDay(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-18');
    expect(localDay(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});
