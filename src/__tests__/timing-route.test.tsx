import { fireEvent, render, screen } from '@testing-library/react-native';

import TimingRoute from '../app/(app)/timing';

let mockUserId: string | undefined;
let mockParams: { mode?: string } = {};
let mockLastSyncedAt: Date | null = null;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  db: { getClientId: () => Promise.resolve('device-1') },
  useGlobalSyncSummary: () => ({ lastSyncedAt: mockLastSyncedAt }),
}));
const mockListStaffSchools = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({ listStaffSchools: (...args: unknown[]) => mockListStaffSchools(...args) }),
}));
const mockPersonalBestTime = jest.fn();
const mockListBySchool = jest.fn();
const mockListGranted = jest.fn();
jest.mock('../modules/accounts', () => ({
  createPowerSyncAuthorizationStatusRepository: () => ({ listGrantedAthleteIds: (...args: unknown[]) => mockListGranted(...args) }),
}));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes/athleteDisplay'),
  createPowerSyncHistoryRepository: () => ({}),
  personalBestTime: (...args: unknown[]) => mockPersonalBestTime(...args),
  createPowerSyncSchoolAthleteRepository: () => ({ listBySchool: (...args: unknown[]) => mockListBySchool(...args) }),
}));
let mockLoadRoster: () => Promise<{ id: string; shortName: string; authorized: boolean }[]>;
let mockFlowSchoolId: string;
let mockLoadBestTime: (athleteId: string, event: unknown) => Promise<number | null>;
jest.mock('../modules/timing', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncMeasurementRepository: () => ({}),
    createPowerSyncSeriesRepository: () => ({}),
    createSecureStoreSessionSetupRepository: () => ({}),
    SchoolChoiceScreen: ({ schools, onChoose }: { schools: { id: string; name: string }[]; onChoose: (id: string) => void }) => (
      <>
        <Text>choose the school</Text>
        {schools.map((school) => (
          <Text key={school.id} onPress={() => onChoose(school.id)}>{school.name}</Text>
        ))}
      </>
    ),
    SeriesTimingFlow: ({ subtitle, schoolId }: { subtitle: string; schoolId: string }) => <Text>{`series flow for ${subtitle} (${schoolId})`}</Text>,
    IndividualTimingFlow: ({ subtitle, schoolId, userId, deviceId, loadRoster, loadBestTime }: { subtitle: string; schoolId: string; userId: string; deviceId: string; loadRoster: typeof mockLoadRoster; loadBestTime: typeof mockLoadBestTime }) => {
      mockFlowSchoolId = schoolId;
      mockLoadRoster = loadRoster;
      mockLoadBestTime = loadBestTime;
      return <Text>{`timing flow for ${subtitle} by ${userId} on ${deviceId}`}</Text>;
    },
  };
});
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: () => false };
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { useLocalSearchParams: () => mockParams, Redirect: ({ href }: { href: string }) => <RNText>{`redirected to ${href}`}</RNText>, useRouter: () => mockRouter };
});

beforeEach(() => {
  mockUserId = 'user-1';
  mockParams = {};
  mockLastSyncedAt = null;
  mockListStaffSchools.mockReset().mockResolvedValue([]);
  mockListBySchool.mockReset().mockResolvedValue([]);
  mockListGranted.mockReset().mockResolvedValue([]);
  mockPersonalBestTime.mockReset();
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
    expect(mockFlowSchoolId).toBe('s1');
    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.queryByText('choose the school')).toBeNull();
  });

  it('asks which school to time for before any flow starts when the user runs several, then times the chosen one', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }, { id: 's2', name: 'Escuela Tiburones' }]);
    await render(<TimingRoute />);

    expect(await screen.findByText('choose the school')).toBeOnTheScreen();
    expect(screen.queryByText(/timing flow/)).toBeNull();

    await fireEvent.press(screen.getByText('Escuela Tiburones'));

    expect(await screen.findByText('timing flow for Escuela Tiburones by user-1 on device-1')).toBeOnTheScreen();
    expect(mockFlowSchoolId).toBe('s2');
  });

  it('marks an athlete without a granted record_times as not authorized, so the flow skips them', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockListBySchool.mockResolvedValue([
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

  it('lists only the athletes of the active school, so no time is written for an athlete of another one', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }, { id: 's2', name: 'Escuela Tiburones' }]);
    mockListBySchool.mockResolvedValue([{ id: 'a9', firstName: 'Eli', lastName: 'Sol', categoryId: null, groupIds: [] }]);
    await render(<TimingRoute />);
    await fireEvent.press(await screen.findByText('Escuela Tiburones'));
    await screen.findByText(/timing flow/);

    expect((await mockLoadRoster()).map((a) => a.id)).toEqual(['a9']);
    expect(mockListBySchool).toHaveBeenCalledWith('s2');
  });

  it('gives the flow a new roster loader after each sync, so a withdrawal marks the athlete as skipped at once', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockLastSyncedAt = new Date(1_000);
    const view = await render(<TimingRoute />);
    await screen.findByText(/timing flow/);
    const before = mockLoadRoster;

    await view.rerender(<TimingRoute />);
    expect(mockLoadRoster).toBe(before);

    mockLastSyncedAt = new Date(2_000);
    await view.rerender(<TimingRoute />);
    expect(mockLoadRoster).not.toBe(before);
  });

  it('gives the flow the best time of the athlete in the event, read from the history on the device', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockPersonalBestTime.mockResolvedValue(3482);
    await render(<TimingRoute />);
    await screen.findByText(/timing flow/);

    const event = { stroke: 'FR', distance: '50m', pool: 'SCM' };
    expect(await mockLoadBestTime('a1', event)).toBe(3482);
    expect(mockPersonalBestTime).toHaveBeenCalledWith(expect.anything(), 'a1', event);
  });

  it('opens the series flow with mode=series, and only for school staff', async () => {
    mockParams = { mode: 'series' };
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await render(<TimingRoute />);

    expect(await screen.findByText('series flow for Escuela Delfines (s1)')).toBeOnTheScreen();
    expect(screen.queryByText(/timing flow/)).toBeNull();
  });

  it('sends a user who belongs to no school back to the home also for the series flow', async () => {
    mockParams = { mode: 'series' };
    await render(<TimingRoute />);

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByText(/series flow/)).toBeNull();
  });
});
