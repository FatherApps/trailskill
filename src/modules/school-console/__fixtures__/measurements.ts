import type { MeasurementEntry } from '../components/MeasurementLog';

// Synthetic data for the development gallery and the tests: fictional people and devices, newest first.
export const measurementsFixture: MeasurementEntry[] = [
  {
    id: 'm1',
    athlete: 'Lucía Ramírez',
    initials: 'LR',
    color: 'athlete-1',
    event: 'Libre 50',
    versions: [{ time: 3482, author: 'Paula G.', device: 'Tablet 2', at: '2026-10-24T08:30' }],
  },
  {
    id: 'm2',
    athlete: 'Mateo Castro',
    initials: 'MC',
    color: 'athlete-2',
    event: 'Libre 50',
    versions: [
      { time: 3391, author: 'Paula G.', device: 'Tablet 2', at: '2026-10-24T08:12' },
      { time: 3419, author: 'Andrés M.', device: 'Teléfono 5', at: '2026-10-24T08:15' },
    ],
  },
  {
    id: 'm3',
    athlete: 'Sara Peña',
    initials: 'SP',
    color: 'athlete-3',
    event: 'Espalda 50',
    versions: [{ time: null, author: 'Paula G.', device: 'Tablet 2', at: '2026-10-24T07:58' }],
  },
  {
    id: 'm4',
    athlete: 'Julián Ortiz',
    initials: 'JO',
    color: 'athlete-4',
    event: 'Libre 100',
    versions: [{ time: 7510, author: 'Andrés M.', device: 'Teléfono 5', at: '2026-10-23T17:05' }],
  },
];

export const longTextMeasurementFixture: MeasurementEntry = {
  id: 'm5',
  athlete: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-2',
  event: 'Combinado individual 200',
  versions: [
    { time: 129660, author: 'Andrés Felipe Martínez', device: 'Tableta del salón de entrenadores', at: '2026-10-22T09:00' },
    { time: 129801, author: 'Paula Andrea Gutiérrez', device: 'Teléfono del entrenador de apoyo', at: '2026-10-22T09:04' },
  ],
};

export const measurementsUpdatedMinutesAgo = 2;
