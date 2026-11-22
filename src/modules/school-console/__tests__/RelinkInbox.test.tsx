import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository, createInMemoryInvitationRepository } from '../../accounts';
import { createInMemoryAthleteRelinkRepository, type AthleteRelinkRepository } from '../../athletes';
import { createAuthorizationsRepository } from '../data/authorizations';
import type { ConsoleAthlete } from '../data/consoleAthletes';
import { AuthorizationsSection } from '../screens/AuthorizationsSection';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only. The key is made up.
const KEY = 'AAAA-BBBB-CCCC-DDDD-EEEE';

const athlete: ConsoleAthlete = {
  id: 'a1',
  name: 'Lucía Ramírez',
  initials: 'LR',
  color: 'athlete-1',
  categoryId: null,
  category: null,
  categorySortOrder: null,
  groupIds: ['g1'],
  groups: ['g1'],
  coachIds: [],
  authorization: 'pending',
  bestTime: null,
};

const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

// A family (swimmer Ana Marín) that already asked school-1 for 3 times.
async function seededRelink() {
  const relink = createInMemoryAthleteRelinkRepository({
    markers: [{ key: KEY, schools: [{ schoolId: 'school-1', schoolName: 'Escuela Delfines', times: 3 }] }],
    managed: [{ athleteId: 'f1', firstName: 'Ana', lastName: 'Marín' }],
    adminSchoolIds: ['school-1'],
  });
  await relink.request('f1', KEY);
  return relink;
}

async function setup(options: { relink?: AthleteRelinkRepository | 'none'; connection?: 'connected' | 'offline' } = {}) {
  const repository = createAuthorizationsRepository({
    athletes: { listAthletes: jest.fn().mockResolvedValue([athlete]) },
    statuses: createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    invitations: createInMemoryInvitationRepository({}),
    sharing: { rpc: jest.fn() },
  });
  Object.assign(repository, { listSharingRequests: jest.fn().mockResolvedValue([]) });
  const relink = options.relink === 'none' ? undefined : (options.relink ?? (await seededRelink()));
  await render(
    <AuthorizationsSection
      width={1280}
      schoolName="Escuela Delfines"
      onNavigate={jest.fn()}
      schoolId="school-1"
      repository={repository}
      relink={relink}
      lastSyncedAt={new Date('2026-10-25T10:00:00')}
      connection={options.connection ?? 'connected'}
      now={() => new Date('2026-10-25T10:03:00')}
    />,
  );
  return { relink };
}

describe('the relink inbox in the authorizations section', () => {
  it('shows the pending request with the swimmer and how many times it would move', async () => {
    await setup();

    expect(await screen.findByText('Solicitudes para recuperar tiempos')).toBeOnTheScreen();
    expect(screen.getByText('Ana Marín')).toBeOnTheScreen();
    expect(screen.getByText(/Pide 3 tiempos de tu escuela/)).toBeOnTheScreen();
  });

  it('asks for confirmation, moves the times only after it and then shows the request as approved', async () => {
    const { relink } = await setup();
    const resolve = jest.spyOn(relink as AthleteRelinkRepository, 'resolve');
    await screen.findByText('Ana Marín');

    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar' }));
    expect(screen.getByText('¿Pasar los tiempos a Ana Marín?')).toBeOnTheScreen();
    expect(resolve).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Pasar los tiempos' }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith(expect.any(String), true));
    expect(await screen.findByLabelText('Aprobada')).toBeOnTheScreen();
    expect(screen.getByText(/Se pasaron 3 tiempos/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });

  it('rejects after its own confirmation and moves nothing', async () => {
    const { relink } = await setup();
    const resolve = jest.spyOn(relink as AthleteRelinkRepository, 'resolve');
    await screen.findByText('Ana Marín');

    await fireEvent.press(screen.getByRole('button', { name: 'Rechazar' }));
    expect(screen.getByText('¿Rechazar la solicitud de Ana Marín?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Rechazar solicitud' }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith(expect.any(String), false));
    expect(await screen.findByLabelText('Rechazada')).toBeOnTheScreen();
  });

  it('cancelling the confirmation changes nothing', async () => {
    const { relink } = await setup();
    const resolve = jest.spyOn(relink as AthleteRelinkRepository, 'resolve');
    await screen.findByText('Ana Marín');

    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(resolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeOnTheScreen();
  });

  it('says so when someone decided first', async () => {
    const { relink } = await setup();
    jest.spyOn(relink as AthleteRelinkRepository, 'resolve').mockResolvedValue({ status: 'already_resolved', moved: 0 });
    await screen.findByText('Ana Marín');

    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pasar los tiempos' }));

    expect(await screen.findByText('Esta solicitud ya estaba resuelta.')).toBeOnTheScreen();
  });

  it('says the decision was not saved when the server cannot be reached', async () => {
    const { relink } = await setup();
    jest.spyOn(relink as AthleteRelinkRepository, 'resolve').mockRejectedValue(new Error('Failed to fetch'));
    await screen.findByText('Ana Marín');

    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pasar los tiempos' }));

    expect(await screen.findByText('No pudimos guardar tu decisión. Revisa tu conexión e inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('offline it does not read the requests and says they are seen with a connection', async () => {
    const { relink } = await setup({ connection: 'offline' });

    expect(await screen.findByText('Las solicitudes para recuperar tiempos se ven solo con conexión.')).toBeOnTheScreen();
    expect(screen.queryByText('Ana Marín')).toBeNull();
    expect(relink).toBeDefined();
  });

  it('offers to read the requests again when the read failed', async () => {
    const relink = await seededRelink();
    jest.spyOn(relink, 'listForSchool').mockRejectedValueOnce(new Error('boom'));
    await setup({ relink });

    expect(await screen.findByText('No pudimos cargar las solicitudes para recuperar tiempos.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('Ana Marín')).toBeOnTheScreen();
  });

  it('shows nothing when no relink repository is given', async () => {
    await setup({ relink: 'none' });

    await screen.findByText('Lucía Ramírez, Acudiente: Sin dato', { exact: false }).catch(() => undefined);
    expect(screen.queryByText('Solicitudes para recuperar tiempos')).toBeNull();
  });
});
