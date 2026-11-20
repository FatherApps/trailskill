import { render, screen } from '@testing-library/react-native';
import { Dimensions, Text } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository } from '../../athletes';
import { ThemeProvider } from '../../../core/theme';
import type { AthleteAvatarRenderer, AthleteAvatarSlot } from '../../../core/ui';
import { athletesFixture, detailFixture } from '../__fixtures__/athletes';
import { authorizationsFixture } from '../__fixtures__/authorizations';
import { measurementsFixture } from '../__fixtures__/measurements';
import { recordsFixture } from '../__fixtures__/records';
import { AthleteDetail } from '../components/AthleteDetail';
import { AthleteTable } from '../components/AthleteTable';
import { AuthorizationList } from '../components/AuthorizationList';
import { MeasurementLog } from '../components/MeasurementLog';
import { RecordTable } from '../components/RecordTable';
import { createConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { MySwimmersSection } from '../screens/MySwimmersSection';

jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

// Synthetic data only. A fake avatar says which athlete and size it was asked for.
const renderer = (id: string): AthleteAvatarRenderer =>
  function fakeAvatar(size) {
    return <Text>{`avatar ${id} ${size}`}</Text>;
  };
const shown = (id: string, size: string) => screen.queryByText(`avatar ${id} ${size}`, { includeHiddenElements: true });

describe('the athlete avatar in the school console rows', () => {
  it('the athletes list form asks for md, the table form for sm, and each draws the initials without one', async () => {
    const athletes = athletesFixture.map((athlete) => ({ ...athlete, avatar: renderer(athlete.id) }));
    const { unmount } = await render(
      <ThemeProvider>
        <AthleteTable athletes={athletes} bestLabel="MP" onSelect={() => {}} compact />
      </ThemeProvider>,
    );
    expect(shown(athletes[0]!.id, 'md')).toBeOnTheScreen();
    await unmount();

    await render(
      <ThemeProvider>
        <AthleteTable athletes={athletes} bestLabel="MP" onSelect={() => {}} />
      </ThemeProvider>,
    );
    expect(shown(athletes[0]!.id, 'sm')).toBeOnTheScreen();
  });

  it('the table without an injected avatar shows the athlete initials in an sm circle', async () => {
    await render(
      <ThemeProvider>
        <AthleteTable athletes={athletesFixture} bestLabel="MP" onSelect={() => {}} />
      </ThemeProvider>,
    );

    expect(screen.getAllByTestId('athlete-avatar', { includeHiddenElements: true })).toHaveLength(athletesFixture.length);
    expect(screen.getAllByText(athletesFixture[0]!.initials, { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('the measurement log and the authorization list ask for md', async () => {
    await render(
      <ThemeProvider>
        <MeasurementLog entries={[{ ...measurementsFixture[0]!, avatar: renderer('m-athlete') }]} />
        <AuthorizationList athletes={[{ ...authorizationsFixture[0]!, avatar: renderer('a-auth') }]} onResend={() => {}} />
      </ThemeProvider>,
    );

    expect(shown('m-athlete', 'md')).toBeOnTheScreen();
    expect(shown('a-auth', 'md')).toBeOnTheScreen();
  });

  it('the records table asks for sm for the athlete who holds a mark', async () => {
    const rows = recordsFixture.map((row) => (row.athlete ? { ...row, avatar: renderer(row.id) } : row));
    await render(
      <ThemeProvider>
        <RecordTable rows={rows} pool="SCM" />
      </ThemeProvider>,
    );

    expect(shown('r1', 'sm')).toBeOnTheScreen();
  });

  it('the athlete detail panel asks for md before the name', async () => {
    await render(
      <ThemeProvider>
        <AthleteDetail athlete={{ ...detailFixture, avatar: renderer('detail') }} />
      </ThemeProvider>,
    );

    expect(shown('detail', 'md')).toBeOnTheScreen();
  });

  it('My swimmers builds each row avatar from the injected component, with the athlete id, initials and colour', async () => {
    const Avatar: AthleteAvatarSlot = ({ athleteId, initials, color, size }) => <Text>{`avatar ${athleteId} ${initials} ${color} ${size}`}</Text>;
    const repository = createConsoleAthletesRepository({
      athletes: createInMemorySchoolAthleteRepository({
        athletes: [{ id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' }],
        athleteSchools: [{ athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' }],
        athleteGroups: [{ athleteId: 'a1', groupId: 'g1' }],
      }),
      authorizations: createInMemoryAuthorizationStatusRepository([]),
      history: createInMemoryHistoryRepository([]),
      measurements: { countCapturedSince: jest.fn().mockResolvedValue(0) },
      structure: createInMemorySchoolStructureRepository({
        categories: [{ id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 1 }],
        groups: [{ id: 'g1', schoolId: 'school-a', name: 'Grupo B' }],
        groupAssignments: [{ coachId: 'k1', groupId: 'g1' }],
        athleteAssignments: [],
        coachMemberships: [{ coachId: 'k1', schoolId: 'school-a' }],
      }),
    });
    await render(
      <ThemeProvider>
        <MySwimmersSection
          width={1280}
          schoolName="Escuela"
          schoolId="school-a"
          coachUserId="k1"
          repository={repository}
          lastSyncedAt={new Date(2026, 9, 24, 11, 55, 0)}
          connection="connected"
          onOpenAthlete={jest.fn()}
          Avatar={Avatar}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText(/^avatar a1 LR athlete-\d md$/, { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
