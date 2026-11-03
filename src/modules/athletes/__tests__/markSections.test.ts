import { importedAchievement } from '../achievements';
import { markSections } from '../markSections';
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
