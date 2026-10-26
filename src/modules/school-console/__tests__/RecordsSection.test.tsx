import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository, type HistoryMeasurement } from '../../athletes';
import { categoriesFixture } from '../__fixtures__/categories';
import { createInMemoryCategoriesRepository, type CategoriesRepository } from '../data/categories';
import { createCategoryRecordsRepository, type CategoryRecordsRepository } from '../data/categoryRecords';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { RecordsSection } from '../screens/RecordsSection';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const mark = (id: string, athleteId: string, hundredths: number | null, over: Partial<HistoryMeasurement> = {}) =>
  ({
    id,
    kind: 'race',
    athleteId,
    seriesId: null,
    arrivalPosition: null,
    hundredths,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt: '2026-01-01T15:00:00Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    origin: 'own',
    ...over,
  }) as HistoryMeasurement;

const records = () =>
  createCategoryRecordsRepository({
    athletes: createInMemorySchoolAthleteRepository({
      athletes: [
        { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
        { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
        { id: 'a3', firstName: 'Nia', lastName: 'Zeta' },
      ],
      athleteSchools: [
        { athleteId: 'a1', schoolId: 'school-1', categoryId: 'c1' },
        { athleteId: 'a2', schoolId: 'school-1', categoryId: 'c1' },
        { athleteId: 'a3', schoolId: 'school-1', categoryId: 'c2' },
      ],
      athleteGroups: [
        { athleteId: 'a1', groupId: 'g1' },
        { athleteId: 'a2', groupId: 'g2' },
      ],
    }),
    history: createInMemoryHistoryRepository([
      mark('m1', 'a1', 3482),
      mark('m2', 'a2', 3391),
      mark('m3', 'a1', 7100, { distance: '100m', pool: 'LCM' }),
      mark('m4', 'a3', 3000),
    ]),
  });

const structure = createInMemorySchoolStructureRepository({
  categories: [],
  groups: [
    { id: 'g1', schoolId: 'school-1', name: 'Grupo Delfines' },
    { id: 'g2', schoolId: 'school-1', name: 'Grupo Tiburones' },
  ],
  groupAssignments: [],
  athleteAssignments: [],
  coachMemberships: [],
});

const categories = () => createInMemoryCategoriesRepository({ categories: categoriesFixture, athleteSchools: [] });

const noCategories = () => createInMemoryCategoriesRepository({ categories: [], athleteSchools: [] });

const section = (
  over: {
    repository?: CategoryRecordsRepository;
    categories?: CategoriesRepository;
    connection?: 'connected' | 'connecting' | 'offline';
    lastSyncedAt?: Date | null;
  } = {},
) => (
  <ThemeProvider>
    <RecordsSection
      width={1280}
      schoolName="Escuela Delfines"
      scrollEnabled={false}
      onNavigate={jest.fn()}
      schoolId="school-1"
      repository={over.repository ?? records()}
      categories={over.categories ?? categories()}
      structure={structure}
      lastSyncedAt={over.lastSyncedAt === undefined ? new Date('2026-10-25T12:00:00Z') : over.lastSyncedAt}
      connection={over.connection ?? 'connected'}
      now={() => new Date('2026-10-25T12:02:00Z')}
    />
  </ThemeProvider>
);

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const athletes = () => screen.queryAllByText(/Ramírez|Castro|Zeta/, { includeHiddenElements: true }).map((n) => n.props.children);

describe('RecordsSection', () => {
  it('shows the best mark of the first active category in the 25 m pool', async () => {
    await render(section());

    expect(await screen.findByRole('button', { name: 'Categoría: Categoría A' })).toBeOnTheScreen();
    expect(screen.getAllByTestId('record-row')).toHaveLength(1);
    expect(athletes()).toEqual(['Mateo Castro']);
    expect(screen.getByRole('radio', { name: '25 m' })).toBeChecked();
  });

  it('changes the rows with the pool', async () => {
    await render(section());
    await screen.findByRole('button', { name: 'Categoría: Categoría A' });

    await fireEvent.press(screen.getByRole('radio', { name: '50 m' }));

    expect(await screen.findByText('Libre 100', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(athletes()).toEqual(['Lucía Ramírez']);
  });

  it('filters by training group without changing the category', async () => {
    await render(section());
    await screen.findByRole('button', { name: 'Categoría: Categoría A' });

    await fireEvent.press(screen.getByRole('button', { name: 'Grupo: Todos los grupos' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Grupo Delfines' }));

    expect(await screen.findByRole('button', { name: 'Grupo: Grupo Delfines' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Categoría: Categoría A' })).toBeOnTheScreen();
    expect(athletes()).toEqual(['Lucía Ramírez']);
  });

  it('changes the category from its sheet, offering only the active ones', async () => {
    await render(section());
    await fireEvent.press(await screen.findByRole('button', { name: 'Categoría: Categoría A' }));

    expect(screen.queryByRole('button', { name: 'Categoría C' })).toBeNull();
    await fireEvent.press(within(screen.getByTestId('side-sheet-overlay')).getByRole('button', { name: 'Categoría B' }));

    expect(await screen.findByRole('button', { name: 'Categoría: Categoría B' })).toBeOnTheScreen();
    expect(athletes()).toEqual(['Nia Zeta']);
  });

  it('shows the empty state when the school has no active category', async () => {
    await render(section({ categories: createInMemoryCategoriesRepository({ categories: [], athleteSchools: [] }) }));

    expect(await screen.findByText('Aún no hay récords')).toBeOnTheScreen();
  });

  it('says the first sync is running, not that the connection is missing, while connecting, never synced and without categories', async () => {
    await render(section({ categories: noCategories(), connection: 'connecting', lastSyncedAt: null }));

    expect(await screen.findByText('Estamos sincronizando')).toBeOnTheScreen();
    expect(
      screen.getByText('Todavía no hay récords guardados en este dispositivo. Aparecerán cuando termine la primera sincronización.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Estás sin conexión')).toBeNull();
  });

  it('keeps the offline state when offline, never synced and without categories', async () => {
    await render(section({ categories: noCategories(), connection: 'offline', lastSyncedAt: null }));

    expect(await screen.findByText('No hay récords guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
  });

  it('shows the error state when the records cannot be read', async () => {
    await render(section({ repository: { list: () => Promise.reject(new Error('boom')) } }));

    expect(await screen.findByText('No pudimos cargar los récords')).toBeOnTheScreen();
  });
});
