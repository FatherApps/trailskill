import { fireEvent, render, screen } from '@testing-library/react-native';

import EditRoute from '../app/(app)/athletes/edit/[id]';

let mockUserId: string | undefined;
let mockShowPhoto = true;
let mockImportAuthorized = true;
let mockManaged: { status: string; athletes?: object[] } = { status: 'loading' };
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null, connection: 'connected' }) }));
jest.mock('../modules/accounts', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncManagedAthleteRepository: () => ({}),
    createSupabaseAthleteShareCodeRepository: () => ({}),
    createSupabaseIdentityDocumentRepository: () => ({}),
    createSecureStoreShareCodeCache: () => ({}),
    useHasValidAuthorization: (athleteId: string, purpose: string) =>
      athleteId.length > 0 && ((purpose === 'show_photo' && mockShowPhoto) || (purpose === 'import_official_results' && mockImportAuthorized)),
    AthleteAvatarWithPhoto: () => <Text>avatar</Text>,
    AthleteIdentityNumberContainer: ({ athleteId, authorized, online, onGoToAuthorizations }: { athleteId: string; authorized: boolean; online: boolean; onGoToAuthorizations: () => void }) => (
      <Text onPress={onGoToAuthorizations}>{`identity of ${athleteId} ${authorized ? 'authorized' : 'needs authorization'} ${online ? 'online' : 'offline'}`}</Text>
    ),
    AthleteShareCodeContainer: ({ athleteId, athleteName }: { athleteId: string; athleteName: string }) => (
      <Text>{`share code of ${athleteId} for ${athleteName}`}</Text>
    ),
  };
});
jest.mock('../modules/athletes', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('../modules/athletes/screens/AthleteEditScreen'),
    athleteDisplay: jest.requireActual('../modules/athletes/athleteDisplay').athleteDisplay,
    createPowerSyncSchoolAthleteRepository: () => ({}),
    createPowerSyncAthleteRepository: () => ({}),
    useAthleteNamesVersion: () => 0,
    AthleteNameContainer: ({ athleteId, firstName, lastName }: { athleteId: string; firstName: string; lastName: string }) => {
      const { Text } = jest.requireActual('react-native');
      return <Text>{`name editor of ${athleteId}: ${firstName} ${lastName}`}</Text>;
    },
    getAthletePhotoService: () => ({}),
    createExpoPhotoPicker: () => ({}),
    useManagedAthletes: () => mockManaged,
    AthletePhotoContainer: ({ athleteId, authorized, onAuthorize }: { athleteId: string; authorized: boolean; onAuthorize: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={`photo of ${athleteId} ${authorized ? 'authorized' : 'needs authorization'}`} onPress={onAuthorize} />
    ),
  };
});
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'a1' }),
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: mockPush, canGoBack: () => true }),
}));
jest.mock('../core/theme', () => jest.requireActual('../core/theme'));

const managedAna = { status: 'ready', athletes: [{ id: 'a1', firstName: 'Ana', lastName: 'Marin' }] };

describe('athlete edit route', () => {
  afterEach(() => {
    mockUserId = undefined;
    mockShowPhoto = true;
    mockImportAuthorized = true;
    mockManaged = { status: 'loading' };
    jest.clearAllMocks();
  });

  it('composes the photo, the editable name and the share code of the swimmer the user manages', async () => {
    mockUserId = 'user-1';
    mockManaged = managedAna;
    await render(<EditRoute />);

    expect(await screen.findByRole('header', { name: 'Editar a Ana Marin' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'photo of a1 authorized' })).toBeOnTheScreen();
    expect(screen.getByText('name editor of a1: Ana Marin')).toBeOnTheScreen();
    expect(screen.getByText('share code of a1 for Ana')).toBeOnTheScreen();
  });

  it('hands the identity number section the import authorization and the connection, and its link opens Autorizaciones', async () => {
    mockUserId = 'user-1';
    mockManaged = managedAna;
    mockImportAuthorized = false;
    await render(<EditRoute />);

    await fireEvent.press(await screen.findByText('identity of a1 needs authorization online'));

    expect(mockPush).toHaveBeenCalledWith('/authorizations');
  });

  it('without show_photo the photo card opens the authorization flow of accounts first', async () => {
    mockUserId = 'user-1';
    mockShowPhoto = false;
    mockManaged = managedAna;
    await render(<EditRoute />);

    await fireEvent.press(await screen.findByRole('button', { name: 'photo of a1 needs authorization' }));

    expect(mockPush).toHaveBeenCalledWith('/authorizations');
  });

  it('Listo and the back button go back', async () => {
    mockUserId = 'user-1';
    mockManaged = managedAna;
    await render(<EditRoute />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Listo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(mockBack).toHaveBeenCalledTimes(2);
  });

  it('keeps the way back while the athletes load, with the loading state', async () => {
    mockUserId = 'user-1';
    mockManaged = { status: 'loading' };
    await render(<EditRoute />);

    expect(screen.queryByText('No encontramos al deportista')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Listo' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows a not-found state with the back button to anyone who does not manage the swimmer, for example the coach', async () => {
    mockUserId = 'user-1';
    mockManaged = { status: 'ready', athletes: [] };
    await render(<EditRoute />);

    expect(screen.getByText('No encontramos al deportista')).toBeOnTheScreen();
    expect(screen.queryByText(/share code/)).toBeNull();
    expect(screen.queryByRole('button', { name: /photo of/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
