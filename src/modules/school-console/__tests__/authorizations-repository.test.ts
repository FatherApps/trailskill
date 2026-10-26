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

type RpcResult = { data: unknown; error: Error | null };

const setup = (statuses: AuthorizationStatusRow[], rpcResult: RpcResult = { data: [], error: null }) => {
  const rpc = jest.fn().mockResolvedValue(rpcResult);
  const listAthletes = jest.fn().mockResolvedValue(athletes);
  const statusRepository = createInMemoryAuthorizationStatusRepository(statuses);
  const invitations = createInMemoryInvitationRepository();
  const repository = createAuthorizationsRepository({
    athletes: { listAthletes },
    statuses: statusRepository,
    invitations,
    sharing: { rpc },
  });
  return { repository, listAthletes, statusRepository, invitations, rpc };
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

  describe('sharing requests (online, through the server functions)', () => {
    it('reads the requests addressed to the school: pending without an approval date, approved with one', async () => {
      const { repository, rpc } = setup([], {
        data: [
          { id: 'r1', target_school_name: 'Escuela Tiburones', requested_at: '2026-10-22T15:00:00.000Z', approved_at: null },
          { id: 'r2', target_school_name: 'Club Olas', requested_at: '2026-10-24T15:00:00.000Z', approved_at: '2026-10-25T15:00:00.000Z' },
        ],
        error: null,
      });

      await expect(repository.listSharingRequests('school-1')).resolves.toEqual([
        { id: 'r1', school: 'Escuela Tiburones', requestedOn: '2026-10-22', status: 'pending' },
        { id: 'r2', school: 'Club Olas', requestedOn: '2026-10-24', status: 'approved' },
      ]);
      expect(rpc).toHaveBeenCalledWith('result_sharing_requests', { school: 'school-1' });
    });

    it('rejects when the server fails, never an empty list', async () => {
      const { repository } = setup([], { data: null, error: new Error('offline') });

      await expect(repository.listSharingRequests('school-1')).rejects.toThrow('offline');
    });

    it('approves and withdraws through their own function with the request id, and rejects on error', async () => {
      const { repository, rpc } = setup([]);

      await repository.approveSharing('r1');
      await repository.withdrawSharing('r2');

      expect(rpc).toHaveBeenNthCalledWith(1, 'approve_result_sharing', { sharing: 'r1' });
      expect(rpc).toHaveBeenNthCalledWith(2, 'withdraw_result_sharing', { sharing: 'r2' });

      const failing = setup([], { data: null, error: new Error('denied') });
      await expect(failing.repository.approveSharing('r1')).rejects.toThrow('denied');
      await expect(failing.repository.withdrawSharing('r1')).rejects.toThrow('denied');
    });
  });
});
