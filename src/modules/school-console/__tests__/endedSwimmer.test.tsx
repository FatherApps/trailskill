import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository, type AthleteSchoolEndRepository, type HistoryMeasurement } from '../../athletes';
import { ThemeProvider } from '../../../core/theme';
import { createInMemoryCategoriesRepository } from '../data/categories';
import { createConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { AthletesSection } from '../screens/AthletesSection';
import { MySwimmersSection } from '../screens/MySwimmersSection';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `swimcro://${path}` }));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

// Synthetic data only. Lucía is active; Mateo was ended by the school and is still read during the window (issue 1436).
const mark = {
  id: 'm1',
  kind: 'race',
  athleteId: 'a2',
  seriesId: null,
  arrivalPosition: null,
  hundredths: 3482,
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  source: 'screen_button',
  createdBy: 'coach-a',
  deviceId: 'device-a',
  capturedAt: '2026-01-01T08:00:00Z',
  parentId: null,
  version: 1,
  editedBy: null,
  editedAt: null,
  editReason: null,
  origin: 'own',
} as HistoryMeasurement;

const repository = () =>
  createConsoleAthletesRepository({
    athletes: createInMemorySchoolAthleteRepository({
      athletes: [
        { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
        { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
      ],
      athleteSchools: [
        { athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a2', schoolId: 'school-a', categoryId: 'c1', endedAt: '2026-11-01T10:00:00.000Z' },
      ],
      athleteGroups: [
        { athleteId: 'a1', groupId: 'g1' },
        { athleteId: 'a2', groupId: 'g1' },
      ],
    }),
    authorizations: createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    history: createInMemoryHistoryRepository([mark]),
    measurements: { countCapturedSince: jest.fn().mockResolvedValue(0) },
    structure: createInMemorySchoolStructureRepository({
      categories: [{ id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 1 }],
      groups: [{ id: 'g1', schoolId: 'school-a', name: 'Grupo B' }],
      groupAssignments: [{ coachId: 'k1', groupId: 'g1' }],
      athleteAssignments: [],
      coachMemberships: [{ coachId: 'k1', schoolId: 'school-a' }],
    }),
  });

const categories = () =>
  createInMemoryCategoriesRepository({
    categories: [{ id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 0, active: true }],
    athleteSchools: [
      { id: 'r1', athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' },
      { id: 'r2', athleteId: 'a2', schoolId: 'school-a', categoryId: 'c1', endedAt: '2026-11-01T10:00:00.000Z' },
    ],
  });

const swimmerEnd: AthleteSchoolEndRepository = { endLink: jest.fn().mockResolvedValue(undefined) } as unknown as AthleteSchoolEndRepository;

const section = () => (
  <ThemeProvider>
    <AthletesSection
      width={1280}
      schoolName="Escuela Delfines"
      onNavigate={jest.fn()}
      schoolId="school-a"
      repository={repository()}
      categories={categories()}
      swimmerEnd={swimmerEnd}
      lastSyncedAt={new Date(2026, 9, 24, 11, 55, 0)}
      connection="connected"
      now={() => new Date(2026, 9, 24, 12, 0, 0)}
    />
  </ThemeProvider>
);

const row = (name: RegExp) => screen.findByRole('button', { name });

describe('the console with a swimmer the school ended', () => {
  it('marks him «Dado de baja» in the list in place of the authorization, and does not count him as active', async () => {
    await render(section());

    expect(await row(/^Mateo Castro, .*Dado de baja/)).toBeOnTheScreen();
    expect(await row(/^Lucía Ramírez, .*Vigente/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Activos: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Autorización pendiente: 0')).toBeOnTheScreen();
  });

  it('reads his profile and marks, with no control that writes: no category choice, no baja, no sharing', async () => {
    await render(section());
    await fireEvent.press(await row(/^Mateo Castro/));

    expect(await screen.findByTestId('detail-panel')).toBeOnTheScreen();
    expect(within(screen.getByTestId('detail-panel')).getByText('Dado de baja', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Mejores marcas')).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Libre 50 · 25 m/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sin categoría' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dar de baja a un nadador' })).toBeNull();
  });

  it('keeps those controls for a swimmer who is still active', async () => {
    await render(section());
    await fireEvent.press(await row(/^Lucía Ramírez/));

    expect(await screen.findByRole('button', { name: 'Sin categoría' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dar de baja a un nadador' })).toBeOnTheScreen();
  });
});

describe('the list of a coach with a swimmer the school ended', () => {
  it('marks him «Dado de baja»', async () => {
    await render(
      <ThemeProvider>
        <MySwimmersSection
          width={1280}
          schoolName="Escuela Delfines"
          schoolId="school-a"
          coachUserId="k1"
          repository={repository()}
          lastSyncedAt={new Date(2026, 9, 24, 11, 55, 0)}
          connection="connected"
          onOpenAthlete={jest.fn()}
          onBack={jest.fn()}
        />
      </ThemeProvider>,
    );

    const mateo = await screen.findByRole('button', { name: /^Mateo Castro/ });
    expect(mateo.props.accessibilityLabel).toContain('Dado de baja');
    expect(screen.getByRole('button', { name: /^Lucía Ramírez/ }).props.accessibilityLabel).not.toContain('Dado de baja');
  });
});
