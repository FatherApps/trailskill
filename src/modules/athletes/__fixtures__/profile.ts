import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';

// Synthetic athlete data for the development gallery and tests: fictional names only, no real people or schools.
export const profileFixture = {
  name: 'Lucía R.',
  category: 'Infantil B',
  schools: [
    { id: 'delfines', name: 'Escuela Delfines' },
    { id: 'norte', name: 'Club Acuático Norte' },
  ],
  longSchools: [
    { id: 'delfines', name: 'Escuela Delfines de Natación y Deportes Acuáticos del Litoral' },
    { id: 'norte', name: 'Club Acuático Norte de Alto Rendimiento' },
  ],
  longName: 'María Fernanda de los Ángeles R.',
  longCategory: 'Infantil B, grupo de desarrollo',
};

export const eventFixture = {
  // Only the events the athlete has results in.
  events: [
    { stroke: 'FR', distance: '50m' },
    { stroke: 'FR', distance: '100m' },
    { stroke: 'BK', distance: '50m' },
    { stroke: 'BR', distance: '50m' },
  ] as { stroke: StrokeCode; distance: DistanceCode }[],
  pools: ['SCM', 'LCM'] as PoolCode[],
  value: { stroke: 'FR', distance: '50m', pool: 'SCM' } as {
    stroke: StrokeCode;
    distance: DistanceCode;
    pool: PoolCode;
  },
};

export const personalBestFixture = {
  stroke: 'FR' as StrokeCode,
  distance: '50m' as DistanceCode,
  pool: 'SCM' as PoolCode,
  best: 3482,
  improvement: { hundredths: 228, months: 6 },
  date: '2026-10-18',
  trainingDate: '2026-09-05',
};
