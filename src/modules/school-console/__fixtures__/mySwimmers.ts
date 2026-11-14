import type { MySwimmerRow } from '../screens/MySwimmersScreen';

// Synthetic data for the development gallery and the tests: fictional people, no real organizations.
export const mySwimmersBestLabelFixture = 'MP Libre 50 · 25 m';

// Times are in hundredths of a second.
export const mySwimmersFixture: MySwimmerRow[] = [
  { id: 'a1', name: 'Lucía Ramírez', initials: 'LR', color: 'athlete-1', detail: 'Categoría B · Grupo B', bestTime: 3482 },
  { id: 'a2', name: 'Mateo Castro', initials: 'MC', color: 'athlete-2', detail: 'Categoría B · Grupo B', bestTime: 3391 },
  { id: 'a3', name: 'Sara Peña', initials: 'SP', color: 'athlete-3', detail: 'Categoría B · Grupo B', bestTime: null },
  { id: 'a4', name: 'Julián Ortiz', initials: 'JO', color: 'athlete-4', detail: 'Categoría C · Grupo C', bestTime: 3647 },
  { id: 'a5', name: 'Valentina Rojas', initials: 'VR', color: 'athlete-1', detail: 'Categoría C · Grupo C', bestTime: 3510 },
];

export const longTextMySwimmerFixture: MySwimmerRow = {
  id: 'a6',
  name: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-2',
  detail: 'Categoría B, grupo de desarrollo · Grupo de iniciación avanzada',
  bestTime: 12966,
};
