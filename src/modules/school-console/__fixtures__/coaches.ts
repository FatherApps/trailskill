import type { CoachRow } from '../components/CoachList';

// Synthetic data for the development gallery and the tests: fictional people.
export const coachesFixture: CoachRow[] = [
  { id: 'c1', name: 'Paula Gutiérrez', initials: 'PG', color: 'athlete-1', groups: ['Grupo A', 'Grupo B'], athleteCount: 24 },
  { id: 'c2', name: 'Andrés Mejía', initials: 'AM', color: 'athlete-2', groups: ['Grupo C'], athleteCount: 1 },
  { id: 'c3', name: 'Camila Ruiz', initials: 'CR', color: 'athlete-3', groups: [], athleteCount: 0 },
];

export const longTextCoachFixture: CoachRow = {
  id: 'c4',
  name: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-4',
  groups: ['Grupo de iniciación avanzada', 'Grupo de desarrollo infantil', 'Grupo de perfeccionamiento'],
  athleteCount: 128,
};
