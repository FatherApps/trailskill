import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import type { RecordSyncState } from '../../../core/sync';
import { ThemeProvider } from '../../../core/theme';
import { createInMemorySchoolAthleteRepository } from '../../athletes';
import { createInMemoryMeasurementRepository, type Measurement } from '../../timing';
import { categoriesFixture } from '../__fixtures__/categories';
import { createInMemoryCategoriesRepository } from '../data/categories';
import { createMeasurementLogRepository, type MeasurementLogRepository } from '../data/measurementLog';
import { MeasurementsSection } from '../screens/MeasurementsSection';

// The sync states come from the watched local database: the test decides them.
let mockStates = new Map<string, RecordSyncState>();
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn(), useRecordSyncStates: () => mockStates }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const measurement = (id: string, athleteId: string, over: Partial<Measurement> = {}) =>
  ({
    id,
    kind: 'race',
    athleteId,
    seriesId: null,
    arrivalPosition: null,
    hundredths: 3482,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'aaaaaaaa-coach-a',
    schoolId: 'school-1',
    deviceId: 'bbbbbbbb-device-a',
    capturedAt: new Date(2026, 9, 24, 8, 30).toISOString(),
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    ...over,
  }) as Measurement;

const athleteRows = {
  athletes: [
    { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
    { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
  ],
  athleteSchools: [
    { athleteId: 'a1', schoolId: 'school-1', categoryId: 'c1' },
    { athleteId: 'a2', schoolId: 'school-1', categoryId: 'c2' },
  ],
  athleteGroups: [],
};

async function repositoryWith(measurements: Measurement[]) {
  const store = createInMemoryMeasurementRepository();
  for (const m of measurements) await store.add(m);
  return createMeasurementLogRepository({ athletes: createInMemorySchoolAthleteRepository(athleteRows), measurements: store });
}

const categories = () => createInMemoryCategoriesRepository({ categories: categoriesFixture, athleteSchools: [] });

const section = (repository: MeasurementLogRepository, sync: { connection?: 'connected' | 'connecting' | 'offline'; lastSyncedAt?: Date | null } = {}) => (
  <ThemeProvider>
    <MeasurementsSection
      width={1280}
      schoolName="Escuela Delfines"
      scrollEnabled={false}
      onNavigate={jest.fn()}
      schoolId="school-1"
      repository={repository}
      categories={categories()}
      lastSyncedAt={sync.lastSyncedAt === undefined ? new Date('2026-10-25T12:00:00Z') : sync.lastSyncedAt}
      connection={sync.connection ?? 'connected'}
      now={() => new Date('2026-10-25T12:02:00Z')}
    />
  </ThemeProvider>
);

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  mockStates = new Map();
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const entries = () => screen.queryAllByTestId('measurement-entry');

describe('MeasurementsSection', () => {
  it('does not load forever while connecting, never synced and without measurements: it says nothing is stored yet', async () => {
    await render(section(await repositoryWith([]), { connection: 'connecting', lastSyncedAt: null }));

    expect(await screen.findByText('No hay mediciones guardadas en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    expect(screen.queryByTestId('state-view')).not.toHaveProp('accessibilityState', { busy: true });
  });

  it('lists the measurements of the school with author, device, type and sync state, and a dash for a missing time', async () => {
    mockStates = new Map<string, RecordSyncState>([['m1', 'synced'], ['m2', 'synced']]);
    await render(
      section(
        await repositoryWith([
          measurement('m1', 'a1'),
          measurement('m2', 'a2', { hundredths: null, capturedAt: new Date(2026, 9, 24, 8, 0).toISOString() }),
          measurement('m3', 'a1', { schoolId: 'school-2' }),
        ]),
      ),
    );

    expect(await screen.findByText('2 mediciones · Actualizado hace 2 min')).toBeOnTheScreen();
    expect(entries()).toHaveLength(2);
    expect(screen.getByLabelText(/^Lucía Ramírez, Libre 50 · Carrera · aaaaaaaa · bbbbbbbb · 24 oct 2026 · 08:30/)).toBeOnTheScreen();
    expect(screen.getAllByText('Enviado', hidden)).toHaveLength(2);
    expect(screen.getAllByText('—', hidden)).toHaveLength(1);
    expect(screen.queryByText('0,00', hidden)).toBeNull();
  });

  it('flags a conflict with "Revisar", counts it in the caption and offers no way to resolve it', async () => {
    mockStates = new Map<string, RecordSyncState>([['m1', 'needs_review']]);
    await render(section(await repositoryWith([measurement('m1', 'a1'), measurement('m2', 'a2')])));

    expect(await screen.findByText('2 mediciones · 1 en conflicto · Actualizado hace 2 min')).toBeOnTheScreen();
    expect(screen.getAllByText('Revisar', hidden)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /resolver|conservar|elegir|aceptar/i })).toBeNull();
  });

  it('narrows the list by athlete name and by a chip, and clears the chip with a second press', async () => {
    await render(
      section(await repositoryWith([measurement('m1', 'a1'), measurement('m2', 'a2', { stroke: 'BK', capturedAt: new Date(2026, 9, 23, 8, 0).toISOString() })])),
    );
    await screen.findByText('2 mediciones · Actualizado hace 2 min');

    await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'castro');
    expect(entries()).toHaveLength(1);
    await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), '');

    await fireEvent.press(screen.getByRole('button', { name: 'Prueba' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Espalda 50' }));
    expect(entries()).toHaveLength(1);
    expect(screen.getByLabelText(/^Mateo Castro, Espalda 50/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Prueba: Espalda 50' }));
    expect(entries()).toHaveLength(2);
  });

  it('shows a page at a time and grows it with "Mostrar más" until every measurement is in', async () => {
    const many = Array.from({ length: 120 }, (_, i) => measurement(`m${String(i).padStart(3, '0')}`, 'a1', { capturedAt: new Date(2026, 9, 24, 8, 0, i).toISOString() }));
    await render(section(await repositoryWith(many)));
    await screen.findByText('120 mediciones · Actualizado hace 2 min');

    expect(entries()).toHaveLength(50);
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar más' }));
    expect(entries()).toHaveLength(100);
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar más' }));
    expect(entries()).toHaveLength(120);
    expect(screen.queryByRole('button', { name: 'Mostrar más' })).toBeNull();
  });

  it('says there are no measurements yet, and offers a retry when the read fails', async () => {
    const failing: MeasurementLogRepository = { list: jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]) };
    await render(section(failing));

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText('Aún no hay mediciones')).toBeOnTheScreen();
  });
});
