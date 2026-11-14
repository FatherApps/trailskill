import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider, type TimingButtonPreferences } from '../../../core/preferences';
import { ThemeProvider } from '../../../core/theme';
import { createFakeTimingButton, createInMemoryMeasurementRepository, createInMemorySeriesRepository, IndividualTimingFlow, SeriesTimingFlow } from '..';

jest.mock('../../../core/sync', () => ({
  useRecordSyncStates: () => new Map(),
  retryFailedRecord: jest.fn(),
  writeBatch: jest.fn(),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockId}` }));

// Synthetic data only.
const roster = [
  {
    id: 'a1',
    shortName: 'Ana M.',
    initials: 'AM',
    color: 'athlete-1' as const,
    authorized: true,
  },
  {
    id: 'a3',
    shortName: 'Cleo O.',
    initials: 'CO',
    color: 'athlete-3' as const,
    authorized: true,
  },
];
const second = 1_000_000_000n;
const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;
const tap = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

function withPreferences(children: React.ReactNode, timingButtons: TimingButtonPreferences) {
  return (
    <ThemeProvider>
      <PreferencesProvider
        repository={createInMemoryPreferencesRepository({
          ...defaultPreferences,
          timingButtons,
        })}
      >
        {children}
      </PreferencesProvider>
    </ThemeProvider>
  );
}

describe('series timing with the timing buttons', () => {
  async function setup(timingButtons = defaultPreferences.timingButtons) {
    const fake = createFakeTimingButton(10n * second);
    const measurements = createInMemoryMeasurementRepository();
    const series = createInMemorySeriesRepository(measurements);
    const openSpy = jest.spyOn(series, 'open');
    await render(
      withPreferences(
        <SeriesTimingFlow
          subtitle="Escuela Delfines"
          schoolId="school-1"
          loadRoster={async () => roster}
          series={series}
          userId="coach-1"
          deviceId="device-1"
          buttons={fake.port}
          onExit={jest.fn()}
        />,
        timingButtons,
      ),
    );
    await screen.findByText('Nadadores (2 de 2)');
    expect(fake.mode).toBe('off');
    await tap('Empezar toma');
    await screen.findByRole('header', { name: 'Serie 1 · Libre 50 m' });
    const press = (keyCode: number) => act(async () => void fake.press(keyCode));
    return { fake, measurements, openSpy, press };
  }

  it('starts with either key, ignores the lockout and records each later press as an arrival from the button', async () => {
    const { fake, measurements, openSpy, press } = await setup();
    expect(fake.mode).toBe('capture');
    expect(fake.keys).toEqual([24, 25]);
    expect(screen.getByTestId('buttons-hint')).toHaveTextContent('Subir volumen (+) o Bajar volumen (−) marca la llegada');

    await press(25); // starts the shared clock
    fake.advance(1n * second);
    await press(24); // inside the 3 s lockout: ignored
    fake.advance(30n * second);
    await press(24);
    fake.advance(3n * second);
    await press(25);
    expect(screen.getAllByLabelText(/^Llegada \d/)).toHaveLength(2);

    // A screen touch on the same clock is the next arrival.
    fake.advance(2n * second);
    await tap('Llegada');

    await tap('Terminar y asignar');
    await screen.findByText(/¿Quién llegó/);
    // Naming the series hands the keys back to the system.
    expect(fake.mode).toBe('off');
    const saved = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => [m.arrivalPosition, m.hundredths, m.source])).toEqual([
      [1, 3100, 'external_button'],
      [2, 3400, 'external_button'],
      [3, 3600, 'screen_button'],
    ]);
    expect(saved[0]).toMatchObject(event);
  });

  it('warns when the connected pulsador goes away, and lets the coach dismiss it', async () => {
    const { fake } = await setup();
    await act(async () => fake.connect([{ id: 7, name: 'USB Headset' }]));
    expect(screen.getByTestId('buttons-hint')).toHaveTextContent(/^Pulsador externo conectado: USB Headset · /);
    expect(screen.queryByTestId('external-disconnected')).toBeNull();

    await act(async () => fake.connect([]));
    expect(screen.getByTestId('external-disconnected')).toBeOnTheScreen();
    await tap('Usar cronómetro en pantalla');
    expect(screen.queryByTestId('external-disconnected')).toBeNull();
  });

  it('never warns with the phone volume keys alone', async () => {
    const { fake } = await setup();
    await act(async () => fake.connect([]));
    expect(screen.queryByTestId('external-disconnected')).toBeNull();
  });

  it('leaves the keys alone when the buttons are off', async () => {
    const { fake } = await setup({
      ...defaultPreferences.timingButtons,
      enabled: false,
    });
    expect(fake.mode).toBe('off');
    expect(fake.press(24)).toBe(false);
    expect(screen.queryByTestId('buttons-hint')).toBeNull();
  });
});

describe('individual timing with the timing buttons', () => {
  async function setup(timingButtons = defaultPreferences.timingButtons) {
    const fake = createFakeTimingButton(10n * second);
    const measurements = createInMemoryMeasurementRepository();
    await render(
      withPreferences(
        <IndividualTimingFlow
          subtitle="Escuela Delfines"
          schoolId="school-1"
          loadRoster={async () => roster}
          measurements={measurements}
          userId="coach-1"
          deviceId="device-1"
          buttons={fake.port}
          onExit={jest.fn()}
        />,
        timingButtons,
      ),
    );
    await screen.findByText('Nadadores (2 de 2)');
    await tap('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    const press = (keyCode: number) => act(async () => void fake.press(keyCode));
    return { fake, measurements, press };
  }

  it('starts, splits and stops with + and −, ignoring a press during the lockout', async () => {
    const { fake, measurements, press } = await setup();
    expect(fake.mode).toBe('capture');
    expect(screen.getByTestId('buttons-hint')).toHaveTextContent('Subir volumen (+) inicia y detiene · Bajar volumen (−) marca parcial');

    await press(24);
    fake.advance(1n * second);
    await press(24); // inside the lockout: ignored
    fake.advance(15n * second);
    await press(25);
    fake.advance(17n * second);
    await press(24);

    await tap('Guardar');
    await screen.findByText('Cleo O. · 2 de 2');
    const saved = await measurements.listByAthleteEvent('a1', event);
    expect(saved.map((m) => [m.kind, m.hundredths]).sort()).toEqual([
      ['repetition', 3300],
      ['split', 1600],
    ]);
  });

  it('mixes a screen touch and a key press on the same clock', async () => {
    const { fake, measurements, press } = await setup();
    await tap('Iniciar');
    fake.advance(42n * second);
    await press(24);
    await tap('Guardar');
    await waitFor(async () => expect((await measurements.listByAthleteEvent('a1', event)).map((m) => m.hundredths)).toEqual([4200]));
  });

  it('leaves the keys alone when the buttons are off', async () => {
    const { fake } = await setup({
      ...defaultPreferences.timingButtons,
      enabled: false,
    });
    expect(fake.mode).toBe('off');
    expect(screen.queryByTestId('buttons-hint')).toBeNull();
  });
});
