import type { CoachRow } from '../components/CoachList';
import type { InviteGroup } from '../components/InviteCoachSheet';

// Synthetic data for the development gallery and the tests: fictional people.
export const coachesFixture: CoachRow[] = [
  { id: 'c1', name: 'Paula Gutiérrez', initials: 'PG', color: 'athlete-1', status: 'active', groups: ['Grupo A', 'Grupo B'], athleteCount: 24 },
  { id: 'c2', name: 'Andrés Mejía', initials: 'AM', color: 'athlete-2', status: 'active', groups: ['Grupo C'], athleteCount: 1 },
  { id: 'c3', name: 'Camila Ruiz', initials: 'CR', color: 'athlete-3', status: 'active', groups: [], athleteCount: 0 },
];

export const longTextCoachFixture: CoachRow = {
  id: 'c4',
  name: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-4',
  status: 'active',
  groups: ['Grupo de iniciación avanzada', 'Grupo de desarrollo infantil', 'Grupo de perfeccionamiento'],
  athleteCount: 128,
};

// A coach whose invitation was sent and not yet accepted (no real source of these exists yet).
export const pendingCoachFixture: CoachRow = {
  id: 'c5',
  name: 'Julio Castaño',
  initials: 'JC',
  color: 'athlete-1',
  status: 'pending',
  groups: ['Grupo B'],
};

// The groups of the school offered as chips in the invite sheet.
export const inviteGroupsFixture: InviteGroup[] = [
  { id: 'g1', name: 'Grupo A' },
  { id: 'g2', name: 'Grupo B' },
  { id: 'g3', name: 'Grupo C' },
];
