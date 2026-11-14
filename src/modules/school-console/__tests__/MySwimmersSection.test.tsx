import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository } from '../../athletes';
import { t } from '../../../core/i18n';
import { ThemeProvider } from '../../../core/theme';
import { createConsoleAthletesRepository, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { MySwimmersSection, type MySwimmersSectionProps } from '../screens/MySwimmersSection';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

// Synthetic data only. Coach k1 has Lucía by her group and Mateo directly; Sara belongs to coach k2; Otto is in another school.
const setup = (): ConsoleAthletesRepository =>
  createConsoleAthletesRepository({
    athletes: createInMemorySchoolAthleteRepository({
      athletes: [
        { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
        { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
        { id: 'a3', firstName: 'Sara', lastName: 'Peña' },
        { id: 'a4', firstName: 'Otto', lastName: 'Elsewhere' },
      ],
      athleteSchools: [
        { athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a2', schoolId: 'school-a', categoryId: 'c2' },
        { athleteId: 'a3', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a4', schoolId: 'school-b', categoryId: 'c9' },
      ],
      athleteGroups: [
        { athleteId: 'a1', groupId: 'g1' },
        { athleteId: 'a2', groupId: 'g2' },
        { athleteId: 'a3', groupId: 'g2' },
        { athleteId: 'a4', groupId: 'g9' },
      ],
    }),
    authorizations: createInMemoryAuthorizationStatusRepository([]),
    history: createInMemoryHistoryRepository([]),
    measurements: { countCapturedSince: jest.fn().mockResolvedValue(0) },
    structure: createInMemorySchoolStructureRepository({
      categories: [
        { id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 1 },
        { id: 'c2', schoolId: 'school-a', name: 'Juvenil', sortOrder: 2 },
        { id: 'c9', schoolId: 'school-b', name: 'Otra escuela', sortOrder: 1 },
      ],
      groups: [
        { id: 'g1', schoolId: 'school-a', name: 'Grupo B' },
        { id: 'g2', schoolId: 'school-a', name: 'Grupo C' },
        { id: 'g9', schoolId: 'school-b', name: 'Grupo otra escuela' },
      ],
      groupAssignments: [
        { coachId: 'k1', groupId: 'g1' },
        { coachId: 'k2', groupId: 'g2' },
        { coachId: 'k9', groupId: 'g9' },
      ],
      athleteAssignments: [{ coachId: 'k1', athleteId: 'a2', schoolId: 'school-a' }],
      coachMemberships: [
        { coachId: 'k1', schoolId: 'school-a' },
        { coachId: 'k2', schoolId: 'school-a' },
      ],
    }),
  });

const element = (extra: Partial<MySwimmersSectionProps> = {}) => (
  <ThemeProvider>
    <MySwimmersSection
      width={1280}
      schoolName="Escuela Delfines"
      schoolId="school-a"
      coachUserId="k1"
      repository={setup()}
      lastSyncedAt={new Date(2026, 9, 24, 11, 55, 0)}
      connection="connected"
      onOpenAthlete={jest.fn()}
      onBack={jest.fn()}
      {...extra}
    />
  </ThemeProvider>
);

const show = (extra: Partial<MySwimmersSectionProps> = {}) => render(element(extra));
const rowNames = () => screen.queryAllByRole('button', { name: /^(Lucía Ramírez|Mateo Castro|Sara Peña|Otto Elsewhere)/ }).map((b) => b.props.accessibilityLabel.split(',')[0]);

describe('MySwimmersSection', () => {
  it('lists the athletes assigned to the coach by group and directly, and no other athlete of the school', async () => {
    await show();

    await screen.findByRole('button', { name: /^Lucía Ramírez/ });
    expect(rowNames()).toEqual(['Mateo Castro', 'Lucía Ramírez']);
    expect(screen.queryByText(/Sara Peña/, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText(/Otto Elsewhere/, { includeHiddenElements: true })).toBeNull();
  });

  it('shows another coach only the athletes of that coach', async () => {
    await show({ coachUserId: 'k2' });

    await screen.findByRole('button', { name: /^Sara Peña/ });
    expect(rowNames()).toEqual(['Mateo Castro', 'Sara Peña']);
  });

  it('shows nobody to a user who is not a coach of the school', async () => {
    await show({ coachUserId: 'guardian-1' });

    expect(await screen.findByText(t('schoolConsole.mySwimmers.empty.title'))).toBeOnTheScreen();
    expect(rowNames()).toEqual([]);
  });

  it('opens the athlete with the id and the full name when its row is pressed', async () => {
    const onOpenAthlete = jest.fn();
    await show({ onOpenAthlete });

    await fireEvent.press(await screen.findByRole('button', { name: /^Lucía Ramírez/ }));

    expect(onOpenAthlete).toHaveBeenCalledWith('a1', 'Lucía Ramírez');
  });

  it('goes back from the back button', async () => {
    const onBack = jest.fn();
    await show({ onBack });

    await fireEvent.press(await screen.findByRole('button', { name: t('common.back') }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has no console navigation: the coach does not receive the admin sections', async () => {
    await show();

    await screen.findByRole('button', { name: /^Lucía Ramírez/ });
    for (const section of ['coaches', 'records', 'measurements', 'authorizations']) {
      expect(screen.queryByRole('tab', { name: t(`schoolConsole.nav.${section}`) })).toBeNull();
    }
  });

  it('shows the loading state while the list is read', async () => {
    await show({ repository: { ...setup(), listAthletes: () => new Promise(() => {}) } });

    expect(screen.getByTestId('state-view')).toBeBusy();
  });

  it('shows the empty state when the coach has no athletes after a sync', async () => {
    await show({ repository: { ...setup(), listAthletes: async () => [] } });

    expect(await screen.findByText(t('schoolConsole.mySwimmers.empty.title'))).toBeOnTheScreen();
  });

  it('does not say the coach has no athletes before the first sync arrives', async () => {
    await show({ repository: { ...setup(), listAthletes: async () => [] }, lastSyncedAt: null, connection: 'connecting' });

    expect(await screen.findByText(t('schoolConsole.screen.connecting.title'))).toBeOnTheScreen();
    expect(screen.queryByText(t('schoolConsole.mySwimmers.empty.title'))).toBeNull();
  });

  it('shows the error state and reads again on retry', async () => {
    const listAthletes = jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue([]);
    await show({ repository: { ...setup(), listAthletes } });

    await fireEvent.press(await screen.findByRole('button', { name: t('schoolConsole.screen.retry') }));

    expect(await screen.findByText(t('schoolConsole.mySwimmers.empty.title'))).toBeOnTheScreen();
    expect(listAthletes).toHaveBeenCalledTimes(2);
  });
});
