import type { OpenConflict } from '../data/conflictReview';

// Synthetic conflicts for the gallery: invented names and devices, fixed dates (local time, so the screen text does not move between machines).
const at = (hour: number, minute: number) => new Date(2026, 9, 25, hour, minute).toISOString();

export const conflictsFixture: { list: OpenConflict[] } = {
  list: [
    {
      id: 'conflict-1',
      expectedVersion: 3,
      athleteName: 'Mateo C.',
      event: { stroke: 'FR', distance: '50m', pool: 'SCM' },
      current: { hundredths: 3520, author: 'Coach Uno', device: 'Teléfono A', at: at(14, 0) },
      incoming: { hundredths: 3480, author: 'Coach Dos', device: 'Teléfono B', at: at(14, 5) },
    },
    {
      id: 'conflict-2',
      expectedVersion: 1,
      athleteName: 'Sofía R.',
      event: { stroke: 'BK', distance: '100m', pool: 'SCM' },
      current: { hundredths: 7215, author: 'Coach Uno', device: 'Teléfono A', at: at(14, 20) },
      incoming: { hundredths: null, author: null, device: null, at: at(14, 22) },
    },
    {
      id: 'conflict-3',
      expectedVersion: 2,
      athleteName: null,
      event: { stroke: 'BR', distance: '50m', pool: 'LCM' },
      current: { hundredths: 4110, author: 'Coach Dos', device: 'Teléfono B', at: at(15, 2) },
      incoming: { hundredths: 4075, author: 'Coach Uno', device: 'Teléfono A', at: at(15, 3) },
    },
  ],
};
