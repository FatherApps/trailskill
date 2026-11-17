import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository } from '../../athletes';
import {
  createInMemoryMeasurementRepository,
  createInMemorySeriesRepository,
  createInMemorySessionSetupRepository,
  type RosterAthlete,
} from '../../timing';
import { createInMemoryStaffSchoolRepository, SchoolTimingContainer, type SchoolTimingRepositories } from '..';

let mockUserId: string | undefined;
let mockLastSyncedAt: Date | null = null;
jest.mock('../../../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../../../core/sync', () => ({
  db: { getClientId: () => Promise.resolve('device-1') },
  useGlobalSyncSummary: () => ({ lastSyncedAt: mockLastSyncedAt }),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('../../../core/navigation', () => ({ useGoBack: () => jest.fn() }));

// The flows have their own suites: here each one is a marker that exposes what the container gave it.
type FlowProps = { subtitle: string; schoolId: string; userId: string; deviceId: string; loadRoster: () => Promise<RosterAthlete[]> };
let mockFlow: FlowProps;
jest.mock('../../timing', () => {
  const { Text: Marker } = jest.requireActual('react-native');
  const marker = (name: string) => {
    function FlowMarker(props: FlowProps) {
      mockFlow = props;
      return <Marker>{`${name} for ${props.subtitle} by ${props.userId} on ${props.deviceId}`}</Marker>;
    }
    return FlowMarker;
  };
  return {
    ...jest.requireActual('../../timing/data/inMemoryMeasurementRepository'),
    ...jest.requireActual('../../timing/data/series'),
    ...jest.requireActual('../../timing/data/sessionSetup'),
    IndividualTimingFlow: marker('individual'),
    SeriesTimingFlow: marker('series'),
    CompletedFlow: marker('completed'),
    SchoolChoiceScreen: ({ schools, onChoose }: { schools: { id: string; name: string }[]; onChoose: (id: string) => void }) => (
      <>
        <Marker>choose the school</Marker>
        {schools.map((school) => (
          <Marker key={school.id} onPress={() => onChoose(school.id)}>{school.name}</Marker>
        ))}
      </>
    ),
  };
});

// Synthetic data only.
const staff = [
  { schoolId: 's1', schoolName: 'Escuela Delfines', userId: 'coach-1', role: 'coach' },
  { schoolId: 's2', schoolName: 'Escuela Tiburones', userId: 'both-1', role: 'school_admin' },
  { schoolId: 's1', schoolName: 'Escuela Delfines', userId: 'both-1', role: 'coach' },
];
const athletes = {
  athletes: [
    { id: 'a1', firstName: 'Ana', lastName: 'Marin' },
    { id: 'a2', firstName: 'Ben', lastName: 'Arce' },
    { id: 'a9', firstName: 'Eli', lastName: 'Sol' },
  ],
  athleteSchools: [
    { athleteId: 'a1', schoolId: 's1', categoryId: null },
    { athleteId: 'a2', schoolId: 's1', categoryId: null },
    { athleteId: 'a9', schoolId: 's2', categoryId: null },
  ],
  athleteGroups: [],
};

function repositories(): SchoolTimingRepositories {
  const measurements = createInMemoryMeasurementRepository();
  return {
    staffSchools: createInMemoryStaffSchoolRepository(staff),
    schoolAthletes: createInMemorySchoolAthleteRepository(athletes),
    authorizations: createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    measurements,
    series: createInMemorySeriesRepository(measurements),
    history: createInMemoryHistoryRepository([]),
    sessionSetups: createInMemorySessionSetupRepository(),
  };
}

const show = (props: { mode?: string } = {}) =>
  render(<SchoolTimingContainer {...props} denied={<Text>denied</Text>} repositories={repositories()} />);

beforeEach(() => {
  mockUserId = 'coach-1';
  mockLastSyncedAt = null;
});

describe('SchoolTimingContainer', () => {
  it('shows the denied element to a user who belongs to no school', async () => {
    mockUserId = 'guardian-1';
    await show();

    expect(await screen.findByText('denied')).toBeOnTheScreen();
    expect(screen.queryByText(/individual/)).toBeNull();
  });

  it('shows the denied element to a signed-out user', async () => {
    mockUserId = undefined;
    await show();

    expect(await screen.findByText('denied')).toBeOnTheScreen();
  });

  it.each([
    [undefined, 'individual'],
    ['series', 'series'],
    ['completed', 'completed'],
  ])('with mode %s opens the %s flow of the only school of the staff member', async (mode, flow) => {
    await show({ mode });

    expect(await screen.findByText(`${flow} for Escuela Delfines by coach-1 on device-1`)).toBeOnTheScreen();
    expect(mockFlow.schoolId).toBe('s1');
  });

  it('asks which school to time for when the user runs several, then times the chosen one', async () => {
    mockUserId = 'both-1';
    await show();
    expect(await screen.findByText('choose the school')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Escuela Tiburones'));

    expect(await screen.findByText('individual for Escuela Tiburones by both-1 on device-1')).toBeOnTheScreen();
    expect(mockFlow.schoolId).toBe('s2');
  });

  it('gives the flow only the athletes of the school, marking those without a granted record_times as not authorized', async () => {
    await show();
    await screen.findByText(/individual/);

    const roster = await mockFlow.loadRoster();

    expect(roster.map((athlete) => [athlete.id, athlete.authorized])).toEqual([
      ['a2', false],
      ['a1', true],
    ]);
  });

  it('gives the flow a new roster loader after each sync, so a withdrawal marks the athlete as skipped at once', async () => {
    mockLastSyncedAt = new Date(1_000);
    const repos = repositories();
    const view = await render(<SchoolTimingContainer denied={null} repositories={repos} />);
    await screen.findByText(/individual/);
    const before = mockFlow.loadRoster;

    await view.rerender(<SchoolTimingContainer denied={null} repositories={repos} />);
    expect(mockFlow.loadRoster).toBe(before);

    mockLastSyncedAt = new Date(2_000);
    await view.rerender(<SchoolTimingContainer denied={null} repositories={repos} />);
    expect(mockFlow.loadRoster).not.toBe(before);
  });
});
