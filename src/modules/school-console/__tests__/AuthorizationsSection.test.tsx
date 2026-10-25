import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository, createInMemoryInvitationRepository, type AuthorizationStatusRow } from '../../accounts';
import { createAuthorizationsRepository } from '../data/authorizations';
import type { ConsoleAthlete } from '../data/consoleAthletes';
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
  } = {},
) => {
  const invitations = createInMemoryInvitationRepository({
    failing: options.failing,
  });
  const repository = createAuthorizationsRepository({
    athletes: {
      listAthletes: jest.fn().mockResolvedValue([athlete('a1', 'Lucía Ramírez', options.groupIds ?? ['g1'])]),
    },
    statuses: createInMemoryAuthorizationStatusRepository(options.statuses ?? [{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    invitations,
  });
  const share = jest.fn().mockResolvedValue(undefined);
  await render(
    <AuthorizationsSection
      width={1280}
      schoolName="Escuela Delfines"
      onNavigate={jest.fn()}
      schoolId="school-1"
      repository={repository}
      lastSyncedAt={new Date('2026-10-25T10:00:00')}
      connection="connected"
      now={() => new Date('2026-10-25T10:03:00')}
      share={share}
    />,
  );
  return { invitations, share };
};

describe('AuthorizationsSection', () => {
  it('shows each purpose of the school athletes from the local data, the guardian as not known, and sharing as not available yet', async () => {
    await setup();

    expect(await screen.findByText('1 deportista · 1 con solicitud pendiente · Actualizado hace 3 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Registrar tiempos y resultados: Vigente')).toBeOnTheScreen();
    expect(screen.getByLabelText('Importar resultados oficiales: Pendiente')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lucía Ramírez, Acudiente: Sin dato')).toBeOnTheScreen();
    expect(screen.getByText('Aprobar que otra escuela vea tus resultados estará disponible más adelante.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
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

  it('says so when the invitation cannot be created, and shares nothing', async () => {
    const { share } = await setup({ failing: true });

    await fireEvent.press((await screen.findAllByRole('button', { name: 'Reenviar solicitud' }))[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));

    expect(await screen.findByText('No pudimos crear la invitación. Revisa la conexión e inténtalo de nuevo.')).toBeOnTheScreen();
    expect(share).not.toHaveBeenCalled();
  });
});
