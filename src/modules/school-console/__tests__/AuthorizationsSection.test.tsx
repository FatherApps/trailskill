import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository, createInMemoryInvitationRepository, type AuthorizationStatusRow } from '../../accounts';
import { createAuthorizationsRepository } from '../data/authorizations';
import type { ConsoleAthlete } from '../data/consoleAthletes';
import type { SharingRequest } from '../components/AuthorizationList';
import { AuthorizationsSection } from '../screens/AuthorizationsSection';

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
  initials: 'XX',
  color: 'athlete-1',
  categoryId: null,
  category: null,
  categorySortOrder: null,
  groupIds,
  groups: groupIds,
  coachIds: [],
  authorization: 'pending',
  bestTime: null,
});

const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const setup = async (
  options: {
    groupIds?: string[];
    statuses?: AuthorizationStatusRow[];
    failing?: boolean;
    requests?: SharingRequest[] | Error | Promise<SharingRequest[]>;
    connection?: 'connected' | 'connecting' | 'offline';
    // No athletes and never synced.
    neverSyncedEmpty?: boolean;
  } = {},
) => {
  const invitations = createInMemoryInvitationRepository({
    failing: options.failing,
  });
  const repository = createAuthorizationsRepository({
    athletes: {
      listAthletes: jest.fn().mockResolvedValue(options.neverSyncedEmpty ? [] : [athlete('a1', 'Lucía Ramírez', options.groupIds ?? ['g1'])]),
    },
    statuses: createInMemoryAuthorizationStatusRepository(options.statuses ?? [{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    invitations,
    sharing: { rpc: jest.fn() },
  });
  let requests = options.requests ?? [];
  const listSharingRequests = jest.fn(async () => {
    if (requests instanceof Error) throw requests;
    return requests;
  });
  const approveSharing = jest.fn(async (id: string) => {
    requests = (requests as SharingRequest[]).map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r));
  });
  const withdrawSharing = jest.fn(async (id: string) => {
    requests = (requests as SharingRequest[]).filter((r) => r.id !== id);
  });
  Object.assign(repository, { listSharingRequests, approveSharing, withdrawSharing });
  const share = jest.fn().mockResolvedValue(undefined);
  await render(
    <AuthorizationsSection
      width={1280}
      schoolName="Escuela Delfines"
      onNavigate={jest.fn()}
      schoolId="school-1"
      repository={repository}
      lastSyncedAt={options.neverSyncedEmpty ? null : new Date('2026-10-25T10:00:00')}
      connection={options.connection ?? 'connected'}
      now={() => new Date('2026-10-25T10:03:00')}
      share={share}
    />,
  );
  return { invitations, share, listSharingRequests, approveSharing, withdrawSharing };
};

describe('AuthorizationsSection', () => {
  it('does not load forever while connecting, never synced and without athletes: it says nothing is stored yet', async () => {
    await setup({ connection: 'connecting', neverSyncedEmpty: true });

    expect(await screen.findByText('No hay autorizaciones guardadas en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    expect(screen.queryByTestId('state-view')).not.toHaveProp('accessibilityState', { busy: true });
  });

  it('shows each purpose of the school athletes from the local data and the guardian as not known', async () => {
    await setup();

    expect(await screen.findByText('1 deportista · 1 con solicitud pendiente · Actualizado hace 3 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Registrar tiempos y resultados: Vigente')).toBeOnTheScreen();
    expect(screen.getByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lucía Ramírez, Acudiente: Sin dato')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });

  const pendingRequest: SharingRequest = { id: 'r1', school: 'Escuela Tiburones', requestedOn: '2026-10-22', status: 'pending' };
  const approvedRequest: SharingRequest = { id: 'r2', school: 'Club Olas', requestedOn: '2026-10-24', status: 'approved' };

  it('shows the requests read online, approves one after the confirmation and reads them again', async () => {
    const { approveSharing, listSharingRequests } = await setup({ requests: [pendingRequest, approvedRequest] });

    expect(await screen.findByText('Escuela Tiburones')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar' }));
    expect(approveSharing).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar acceso' }));

    await waitFor(() => expect(approveSharing).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(listSharingRequests).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull());
  });

  it('withdraws an approved request after the confirmation and reads them again', async () => {
    const { withdrawSharing, listSharingRequests } = await setup({ requests: [approvedRequest] });

    await fireEvent.press(await screen.findByRole('button', { name: 'Retirar' }));
    expect(withdrawSharing).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar acceso' }));

    await waitFor(() => expect(withdrawSharing).toHaveBeenCalledWith('r2'));
    await waitFor(() => expect(listSharingRequests).toHaveBeenCalledTimes(2));
  });

  it('says so when approving fails', async () => {
    const { approveSharing } = await setup({ requests: [pendingRequest] });
    approveSharing.mockRejectedValueOnce(new Error('denied'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Aprobar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Aprobar acceso' }));

    expect(await screen.findByText('No pudimos actualizar la solicitud. Revisa la conexión e inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('rejects a pending request after the confirmation and reads them again', async () => {
    const { withdrawSharing, listSharingRequests } = await setup({ requests: [pendingRequest] });

    await fireEvent.press(await screen.findByRole('button', { name: 'Rechazar' }));
    expect(withdrawSharing).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Rechazar solicitud' }));

    await waitFor(() => expect(withdrawSharing).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(listSharingRequests).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull());
  });

  it('says so when withdrawing fails, and reads the requests again because they may have changed', async () => {
    const { withdrawSharing, listSharingRequests } = await setup({ requests: [approvedRequest] });
    withdrawSharing.mockRejectedValueOnce(new Error('denied'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Retirar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar acceso' }));

    expect(await screen.findByText('No pudimos actualizar la solicitud. Revisa la conexión e inténtalo de nuevo.')).toBeOnTheScreen();
    await waitFor(() => expect(listSharingRequests).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Retirar' })).toBeOnTheScreen();
  });

  it('keeps the athletes and shows the online-only note when the console is offline, without reading the requests', async () => {
    const { listSharingRequests } = await setup({ connection: 'offline', requests: [pendingRequest] });

    expect(await screen.findByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
    expect(screen.getByText('Las solicitudes de otras escuelas se ven solo con conexión.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(listSharingRequests).not.toHaveBeenCalled();
  });

  it('shows a read error with a retry, not the online-only note, when the online read fails, and reads again on retry', async () => {
    const { listSharingRequests } = await setup({ requests: new Error('network') });

    expect(await screen.findByText('No pudimos cargar las solicitudes de otras escuelas.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
    expect(screen.queryByText('Las solicitudes de otras escuelas se ven solo con conexión.')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    await waitFor(() => expect(listSharingRequests).toHaveBeenCalledTimes(2));
  });

  it('shows no online-only note while the first online read is still loading', async () => {
    let release: (requests: SharingRequest[]) => void = () => undefined;
    await setup({ requests: new Promise<SharingRequest[]>((resolve) => (release = resolve)) });

    expect(await screen.findByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
    expect(screen.queryByText('Las solicitudes de otras escuelas se ven solo con conexión.')).toBeNull();

    release([pendingRequest]);
    expect(await screen.findByText('Escuela Tiburones')).toBeOnTheScreen();
  });

  it('re-sends with a new invitation for the athlete group and opens the share sheet with its code', async () => {
    const { invitations, share } = await setup();

    await fireEvent.press((await screen.findAllByRole('button', { name: 'Reenviar solicitud' }))[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));

    expect(invitations.created).toEqual([{ schoolId: 'school-1', groupId: 'g1' }]);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0]).toContain(`Código de invitación: ${'1'.padStart(32, '0')}`);
    expect(share.mock.calls[0][0]).toContain('Escuela Delfines');
  });

  it('offers no re-send for an athlete without a group', async () => {
    await setup({ groupIds: [] });

    expect(await screen.findByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Reenviar solicitud' })).toBeNull();
  });

  it('creates one invitation when "Reenviar al acudiente" is pressed twice while the first is still running', async () => {
    const { invitations, share } = await setup();
    const create = invitations.create.bind(invitations);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowCreate = jest.fn(async (input: Parameters<typeof create>[0]) => {
      await gate;
      return create(input);
    });
    invitations.create = slowCreate;

    // The sheet closes on confirm, so a second confirmation means opening it again while the first send is running.
    for (let press = 0; press < 2; press += 1) {
      await fireEvent.press((await screen.findAllByRole('button', { name: 'Reenviar solicitud' }))[0]);
      await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));
    }
    release();

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(slowCreate).toHaveBeenCalledTimes(1);
    expect(invitations.created).toHaveLength(1);
  });

  it('shares the invitation without the expiry sentence when the expiry date cannot be read', async () => {
    const { invitations, share } = await setup();
    const create = invitations.create.bind(invitations);
    invitations.create = async (input) => ({ ...(await create(input)), expiresAt: 'not-a-date' });

    await fireEvent.press((await screen.findAllByRole('button', { name: 'Reenviar solicitud' }))[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const message = share.mock.calls[0][0] as string;
    expect(message).toContain(`Código de invitación: ${'1'.padStart(32, '0')}`);
    expect(message).not.toContain('Vence');
    expect(message).not.toMatch(/\s{2,}|\.\./);
  });

  it('keeps the screen working, with no error and no second invitation, when the share sheet fails', async () => {
    const { invitations, share } = await setup();
    share.mockRejectedValue(new Error('share sheet failed'));

    await fireEvent.press((await screen.findAllByRole('button', { name: 'Reenviar solicitud' }))[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(invitations.created).toHaveLength(1);
    expect(screen.queryByText('No pudimos crear la invitación. Revisa la conexión e inténtalo de nuevo.')).toBeNull();
    expect(screen.getByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
  });

  it('says so when the invitation cannot be created, and shares nothing', async () => {
    const { share } = await setup({ failing: true });

    await fireEvent.press((await screen.findAllByRole('button', { name: 'Reenviar solicitud' }))[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));

    expect(await screen.findByText('No pudimos crear la invitación. Revisa la conexión e inténtalo de nuevo.')).toBeOnTheScreen();
    expect(share).not.toHaveBeenCalled();
  });
});
