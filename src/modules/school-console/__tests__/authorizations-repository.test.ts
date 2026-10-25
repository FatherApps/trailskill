import { createInMemoryAuthorizationStatusRepository, createInMemoryInvitationRepository, type AuthorizationStatusRow } from '../../accounts';
import { createAuthorizationsRepository } from '../data/authorizations';
import type { ConsoleAthlete } from '../data/consoleAthletes';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({
  db: {},
  supabase: {},
  writeRecord: jest.fn(),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const athlete = (id: string, name: string, groupIds: string[]): ConsoleAthlete => ({
  id,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  color: 'athlete-1',
  categoryId: null,
  category: null,
  categorySortOrder: null,
  groupIds,
  groups: groupIds.map((groupId) => `Group ${groupId}`),
  coachIds: [],
  authorization: 'pending',
  bestTime: null,
});

const athletes = [athlete('a1', 'Lucía Ramírez', ['g1', 'g2']), athlete('a2', 'Mateo Castro', []), athlete('a3', 'Sara Peña', ['g2'])];

const setup = (statuses: AuthorizationStatusRow[]) => {
  const listAthletes = jest.fn().mockResolvedValue(athletes);
  const statusRepository = createInMemoryAuthorizationStatusRepository(statuses);
  const invitations = createInMemoryInvitationRepository();
  const repository = createAuthorizationsRepository({
    athletes: { listAthletes },
    statuses: statusRepository,
    invitations,
  });
  return { repository, listAthletes, statusRepository, invitations };
};

describe('authorizations repository', () => {
  it('marks every purpose pending when the athlete has no status row: nothing is valid by default', async () => {
    const { repository, listAthletes } = setup([]);

    const rows = await repository.listAthletes('school-1');

    expect(listAthletes).toHaveBeenCalledWith('school-1');
    expect(rows.map((row) => row.purposes)).toEqual([
      { record: 'pending', import: 'pending', share: 'pending' },
      { record: 'pending', import: 'pending', share: 'pending' },
      { record: 'pending', import: 'pending', share: 'pending' },
    ]);
  });

  it('reads each purpose on its own: granted is valid, not granted is withdrawn, and one never implies another', async () => {
    const { repository } = setup([
      { athleteId: 'a1', purpose: 'record_times', isGranted: true },
      { athleteId: 'a1', purpose: 'import_official_results', isGranted: false },
      {
        athleteId: 'a3',
        purpose: 'share_results_with_school',
        isGranted: true,
      },
      // Another school's athlete: never shown.
      { athleteId: 'x9', purpose: 'record_times', isGranted: true },
    ]);

    const rows = await repository.listAthletes('school-1');

    expect(rows).toEqual([
      {
        id: 'a1',
        athlete: 'Lucía Ramírez',
        initials: 'LU',
        color: 'athlete-1',
        groupId: 'g1',
        purposes: { record: 'valid', import: 'withdrawn', share: 'pending' },
      },
      {
        id: 'a2',
        athlete: 'Mateo Castro',
        initials: 'MA',
        color: 'athlete-1',
        groupId: null,
        purposes: { record: 'pending', import: 'pending', share: 'pending' },
      },
      {
        id: 'a3',
        athlete: 'Sara Peña',
        initials: 'SA',
        color: 'athlete-1',
        groupId: 'g2',
        purposes: { record: 'pending', import: 'pending', share: 'valid' },
      },
    ]);
  });

  it('re-sends with a new invitation for the group and leaves the recorded authorizations as they were', async () => {
    const statuses: AuthorizationStatusRow[] = [{ athleteId: 'a1', purpose: 'record_times', isGranted: true }];
    const { repository, invitations, statusRepository } = setup(statuses);

    await expect(repository.resend('school-1', 'g1')).resolves.toEqual({
      token: expect.any(String),
      expiresAt: expect.any(String),
    });
    await repository.resend('school-1', 'g1');

    expect(invitations.created).toEqual([
      { schoolId: 'school-1', groupId: 'g1' },
      { schoolId: 'school-1', groupId: 'g1' },
    ]);
    await expect(statusRepository.listStatuses(['a1'])).resolves.toEqual([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]);
  });
});
