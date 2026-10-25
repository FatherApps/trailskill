import type { AthleteAuthorizations, SharingRequest } from '../components/AuthorizationList';

// Synthetic data for the development gallery and the tests: fictional people and schools.
export const authorizationsFixture: AthleteAuthorizations[] = [
  {
    id: 'a1',
    athlete: 'Lucía Ramírez',
    initials: 'LR',
    color: 'athlete-1',
    guardian: 'Paula Gómez',
    purposes: { record: 'valid', import: 'valid', share: 'pending' },
    canResend: true,
  },
  {
    id: 'a2',
    athlete: 'Mateo Castro',
    initials: 'MC',
    color: 'athlete-2',
    guardian: 'Camila Torres',
    purposes: { record: 'valid', import: 'withdrawn', share: 'valid' },
    canResend: true,
  },
  {
    id: 'a3',
    athlete: 'Sara Peña',
    initials: 'SP',
    color: 'athlete-3',
    guardian: 'Camilo Peña',
    purposes: { record: 'pending', import: 'pending', share: 'pending' },
    canResend: true,
  },
  {
    id: 'a4',
    athlete: 'Julián Ortiz',
    initials: 'JO',
    color: 'athlete-4',
    guardian: 'Luz Marina Ortiz',
    purposes: { record: 'valid', import: 'valid', share: 'valid' },
    canResend: true,
  },
];

export const longTextAuthorizationFixture: AthleteAuthorizations = {
  id: 'a5',
  athlete: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-2',
  guardian: 'Luz Marina Villegas de Restrepo',
  purposes: { record: 'pending', import: 'withdrawn', share: 'pending' },
  canResend: true,
};

export const sharingRequestsFixture: SharingRequest[] = [
  { id: 's1', school: 'Escuela Tiburones', requestedOn: '2026-10-22', status: 'pending' },
  { id: 's2', school: 'Club Náutico Olas de la Costa Atlántica', requestedOn: '2026-10-24', status: 'approved' },
];
