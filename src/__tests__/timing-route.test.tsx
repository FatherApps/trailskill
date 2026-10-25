import { render, screen } from '@testing-library/react-native';

import TimingRoute from '../app/(app)/timing';

let mockUserId: string | undefined;
let mockParams: { mode?: string } = {};
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  db: { getClientId: () => Promise.resolve('device-1') },
  useGlobalSyncSummary: () => ({ lastSyncedAt: null }),
}));
const mockListStaffSchools = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({ listStaffSchools: (...args: unknown[]) => mockListStaffSchools(...args) }),
}));
const mockListAll = jest.fn();
const mockListGranted = jest.fn();
jest.mock('../modules/accounts', () => ({
  createPowerSyncAuthorizationStatusRepository: () => ({ listGrantedAthleteIds: (...args: unknown[]) => mockListGranted(...args) }),
}));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes/athleteDisplay'),
  createPowerSyncSchoolAthleteRepository: () => ({ listAll: (...args: unknown[]) => mockListAll(...args) }),
}));
let mockLoadRoster: () => Promise<{ id: string; shortName: string; authorized: boolean }[]>;
jest.mock('../modules/timing', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncMeasurementRepository: () => ({}),
    createPowerSyncSeriesRepository: () => ({}),
    SeriesTimingFlow: ({ subtitle }: { subtitle: string }) => <Text>{`series flow for ${subtitle}`}</Text>,
    IndividualTimingFlow: ({ subtitle, userId, deviceId, loadRoster }: { subtitle: string; userId: string; deviceId: string; loadRoster: typeof mockLoadRoster }) => {
      mockLoadRoster = loadRoster;
      return <Text>{`timing flow for ${subtitle} by ${userId} on ${deviceId}`}</Text>;
    },
  };
});
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { useLocalSearchParams: () => mockParams, Redirect: ({ href }: { href: string }) => <RNText>{`redirected to ${href}`}</RNText>, router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => false } };
});

beforeEach(() => {
  mockUserId = 'user-1';
  mockParams = {};
  mockListStaffSchools.mockReset().mockResolvedValue([]);
  mockListAll.mockReset().mockResolvedValue([]);
  mockListGranted.mockReset().mockResolvedValue([]);
});

describe('timing route', () => {
  it('sends a user who belongs to no school, such as a guardian, back to the home', async () => {
    await render(<TimingRoute />);

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByText(/timing flow/)).toBeNull();
  });

  it('sends a signed-out user back to the home', async () => {
    mockUserId = undefined;
    await render(<TimingRoute />);

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
  });

  it('opens the timing of the school for school staff', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await render(<TimingRoute />);

    expect(await screen.findByText('timing flow for Escuela Delfines by user-1 on device-1')).toBeOnTheScreen();
    expect(screen.queryByText(/redirected/)).toBeNull();
  });

  it('marks an athlete without a granted record_times as not authorized, so the flow skips them', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockListAll.mockResolvedValue([
      { id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] },
      { id: 'a2', firstName: 'Ben', lastName: 'Arce', categoryId: null, groupIds: [] },
    ]);
    mockListGranted.mockResolvedValue(['a1']);
    await render(<TimingRoute />);
    await screen.findByText(/timing flow/);

    const roster = await mockLoadRoster();

    expect(roster.map((a) => [a.id, a.authorized])).toEqual([['a1', true], ['a2', false]]);
    expect(mockListGranted).toHaveBeenCalledWith('record_times');
  });

  it('opens the series flow with mode=series, and only for school staff', async () => {
    mockParams = { mode: 'series' };
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await render(<TimingRoute />);

    expect(await screen.findByText('series flow for Escuela Delfines')).toBeOnTheScreen();
    expect(screen.queryByText(/timing flow/)).toBeNull();
  });

  it('sends a user who belongs to no school back to the home also for the series flow', async () => {
    mockParams = { mode: 'series' };
    await render(<TimingRoute />);

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByText(/series flow/)).toBeNull();
  });
});
