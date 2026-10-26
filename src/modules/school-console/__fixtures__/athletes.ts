import type { AthleteDetailData, AthleteRow, CategoryChoice } from '../components/athleteTypes';

// Synthetic data for the development gallery and the tests: fictional people and school, no real organizations.
export const schoolNameFixture = 'Escuela Delfines';

export const indicatorsFixture = {
  active: 128,
  pendingAuthorization: 7,
  measurementsThisWeek: 342,
  toReview: 2,
};

// Times are in hundredths of a second: the personal best of the event the table shows (Libre 50).
export const athletesFixture: AthleteRow[] = [
  { id: 'a1', name: 'Lucía Ramírez', initials: 'LR', color: 'athlete-1', category: 'Categoría B', group: 'Grupo B', coach: 'Paula G.', authorization: 'valid', bestTime: 3482 },
  { id: 'a2', name: 'Mateo Castro', initials: 'MC', color: 'athlete-2', category: 'Categoría B', group: 'Grupo B', coach: 'Paula G.', authorization: 'valid', bestTime: 3391 },
  { id: 'a3', name: 'Sara Peña', initials: 'SP', color: 'athlete-3', category: 'Categoría B', group: 'Grupo B', coach: 'Paula G.', authorization: 'pending', bestTime: null },
  { id: 'a4', name: 'Julián Ortiz', initials: 'JO', color: 'athlete-4', category: 'Categoría B', group: 'Grupo C', coach: 'Andrés M.', authorization: 'valid', bestTime: 3647 },
  { id: 'a5', name: 'Valentina Rojas', initials: 'VR', color: 'athlete-1', category: 'Categoría B', group: 'Grupo C', coach: 'Andrés M.', authorization: 'valid', bestTime: 3510 },
];

export const longTextAthleteFixture: AthleteRow = {
  id: 'a6',
  name: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-2',
  category: 'Categoría B, grupo de desarrollo',
  group: 'Grupo de iniciación avanzada',
  coach: 'Andrés Felipe Martínez',
  authorization: 'pending',
  bestTime: 12966,
};

export const sourceFixture = 'FEDNAT';

export const detailFixture: AthleteDetailData = {
  id: 'a1',
  name: 'Lucía Ramírez',
  category: 'Categoría B',
  authorization: 'valid',
  guardian: { name: 'Paula Gómez', contact: 'paula.gomez@example.com' },
  bests: [
    { id: 'b1', event: 'Libre 50', time: 3482 },
    { id: 'b2', event: 'Espalda 50', time: 4108 },
    { id: 'b3', event: 'Libre 100', time: 7966, source: sourceFixture },
  ],
};

export const detailsFixture: Record<string, AthleteDetailData> = {
  a1: detailFixture,
  a3: {
    id: 'a3',
    name: 'Sara Peña',
    category: 'Categoría B',
    authorization: 'pending',
    guardian: { name: 'Camilo Peña', contact: 'camilo.pena@example.com' },
    bests: [],
  },
};

// The detail of any athlete of the list: the written ones, or a generic one built from the row.
export const detailFor = (athlete: AthleteRow): AthleteDetailData =>
  detailsFixture[athlete.id] ?? {
    id: athlete.id,
    name: athlete.name,
    category: athlete.category,
    authorization: athlete.authorization,
    guardian: { name: 'Camila Torres', contact: 'camila.torres@example.com' },
    bests: [{ id: `${athlete.id}-best`, event: 'Libre 50', time: athlete.bestTime }],
  };

// The category selector of the detail: two active categories, the athlete's own inactive one, and none.
export const categoryChoiceFixture: CategoryChoice = {
  options: [
    { id: 'c1', label: 'Infantil A' },
    { id: 'c2', label: 'Infantil B' },
    { id: 'c3', label: 'Juvenil · Inactiva' },
    { id: null, label: 'Sin categoría' },
  ],
  selectedId: 'c2',
  error: null,
  onChoose: () => {},
};

export const longTextDetailFixture: AthleteDetailData = {
  ...detailFixture,
  name: 'María Fernanda de los Ángeles Restrepo Villegas',
  category: 'Categoría B, grupo de desarrollo',
  guardian: { name: 'Luz Marina Villegas de Restrepo', contact: 'luz.marina.villegas.restrepo@example.com' },
  bests: [{ id: 'l1', event: 'Combinado individual 200', time: 12966, source: 'Asociación Departamental de Natación' }],
};

export const storedOnFixture = '2026-10-23';
