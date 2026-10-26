import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '../gallery';

const entry = (id: string) => galleryEntries.find((e) => e.id === id)!;
const themes: ThemeName[] = ['light', 'dark'];

const cases = galleryEntries.flatMap((e) =>
  Object.keys(e.states).flatMap((state) => themes.flatMap((theme) => [1, 2].map((scale) => [e.id, state, theme, scale] as const))),
);

describe('timing gallery entries', () => {
  it('cover setup and every stopwatch state', () => {
    expect(galleryEntries.map((e) => e.id)).toEqual([
      'timingSetup',
      'timingSummary',
      'stopwatch',
      'arrivalList',
      'nameCard',
      'seriesTiming',
      'seriesAssignment',
      'completed',
    ]);
    expect(Object.keys(entry('timingSetup').states)).toEqual(['setup', 'setup-skipped', 'setup-empty']);
    expect(Object.keys(entry('timingSummary').states)).toEqual([
      'summary',
      'summary-loading',
      'summary-error',
      'summary-empty',
      'summary-offline',
    ]);
    expect(Object.keys(entry('stopwatch').states)).toEqual([
      'ready',
      'running',
      'running-splits',
      'stopped',
      'stopped-slower',
      'stopped-no-pb',
      'exit-confirm',
      'offline',
      'pending-count',
    ]);
    expect(Object.keys(entry('arrivalList').states)).toEqual(['arrivals', 'many-arrivals']);
    expect(Object.keys(entry('nameCard').states)).toEqual(['unassigned', 'assigned', 'all-colours']);
    expect(Object.keys(entry('seriesTiming').states)).toEqual([
      'no-arrivals',
      'running',
      'external-disconnected',
      'offline',
    ]);
    expect(Object.keys(entry('seriesAssignment').states)).toEqual([
      'in-progress',
      'all-assigned',
      'pending',
      'reopened',
      'completion-off',
      'completion-on',
      'offline',
    ]);
    expect(Object.keys(entry('completed').states)).toEqual(['completed', 'completed-empty']);
  });

  it.each(cases)('%s / %s renders in %s theme at scale %s', async (id, state, theme, scale) => {
    await render(
      <ThemeProvider name={theme} fontScale={scale}>
        {entry(id).states[state]()}
      </ThemeProvider>,
    );
  });

  it('animates the running state with the fake clock', async () => {
    jest.useFakeTimers();
    try {
      await render(<ThemeProvider>{entry('stopwatch').states.running()}</ThemeProvider>);
      const clock = () => screen.getByTestId('stopwatch-time', { includeHiddenElements: true }).props.children;
      const before = clock();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(clock()).not.toBe(before);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['timingSetup', 'setup', '1 · Mateo C.'],
    ['timingSetup', 'setup-skipped', 'Falta autorización — se omitirá'],
    ['timingSetup', 'setup-empty', 'Aún no hay nadadores'],
    ['timingSummary', 'summary', 'Resumen de la toma'],
    ['timingSummary', 'summary-error', 'No pudimos cargar el resumen'],
    ['timingSummary', 'summary-empty', 'Sin tiempos guardados'],
    ['timingSummary', 'summary-offline', 'Sin conexión. Se guarda en el teléfono.'],
    ['stopwatch', 'offline', 'Sin conexión. Se guarda en el teléfono.'],
    ['arrivalList', 'arrivals', '31,05'],
    ['arrivalList', 'many-arrivals', '8.º'],
    ['nameCard', 'unassigned', 'Mateo C.'],
    ['nameCard', 'assigned', '2.º'],
    ['nameCard', 'all-colours', 'Tomás V.'],
    ['seriesTiming', 'no-arrivals', 'Aún no hay llegadas'],
    ['seriesTiming', 'running', 'Deshacer última'],
    ['seriesTiming', 'external-disconnected', 'Usar cronómetro en pantalla'],
    ['seriesTiming', 'offline', 'Sin conexión. Se guarda en el teléfono.'],
    ['seriesAssignment', 'in-progress', 'Posición 3 de 4'],
    ['seriesAssignment', 'all-assigned', 'Todas las posiciones tienen nombre.'],
    ['seriesAssignment', 'pending', 'por asignar'],
    ['seriesAssignment', 'reopened', 'Posición 1 de 4'],
    ['seriesAssignment', 'completion-off', 'Completado'],
    ['seriesAssignment', 'completion-on', 'Completado'],
    ['seriesAssignment', 'offline', 'Sin conexión. Se guarda en el teléfono.'],
    ['completed', 'completed', 'Completado sin tiempo'],
    ['completed', 'completed-empty', 'Aún no hay nadadores'],
  ])('%s / %s shows its content', async (id, state, text) => {
    await render(<ThemeProvider>{entry(id).states[state]()}</ThemeProvider>);

    expect(screen.getAllByText(text, { exact: false, includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('shows the personal best with and without a value', async () => {
    await render(<ThemeProvider>{entry('stopwatch').states.stopped()}</ThemeProvider>);
    expect(screen.getByText('MP 34,82')).toBeOnTheScreen();

    await render(<ThemeProvider>{entry('stopwatch').states['stopped-no-pb']()}</ThemeProvider>);
    expect(screen.getByText('MP —')).toBeOnTheScreen();
  });

  it('shows the difference against the personal best, faster and slower', async () => {
    const hidden = { includeHiddenElements: true };
    await render(<ThemeProvider>{entry('stopwatch').states.stopped()}</ThemeProvider>);
    expect(screen.getByText('−0,91 vs MP', hidden)).toBeOnTheScreen();

    await render(<ThemeProvider>{entry('stopwatch').states['stopped-slower']()}</ThemeProvider>);
    expect(screen.getByText('+0,40 vs MP', hidden)).toBeOnTheScreen();
  });

  it('adds an arrival and undoes it in the series timing preview', async () => {
    await render(<ThemeProvider>{entry('seriesTiming').states['no-arrivals']()}</ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Deshacer última' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Llegada' }));
    expect(screen.getAllByLabelText(/^Llegada \d/)).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Deshacer última' }));
    expect(screen.getByText('Aún no hay llegadas')).toBeOnTheScreen();
  });

  it.each([
    ['no-arrivals', '0:00,00'],
    ['running', '0:56,70'],
    ['external-disconnected', '0:56,70'],
    ['offline', '0:56,70'],
  ])('keeps the series timing clock still in %s', async (state, time) => {
    jest.useFakeTimers();
    try {
      await render(<ThemeProvider>{entry('seriesTiming').states[state]()}</ThemeProvider>);
      expect(screen.getByText(time, { includeHiddenElements: true })).toBeOnTheScreen();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.getByText(time, { includeHiddenElements: true })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('assigns a name and advances the highlight in the assignment preview, then reopens', async () => {
    await render(<ThemeProvider>{entry('seriesAssignment').states['in-progress']()}</ThemeProvider>);
    expect(screen.getByText('Posición 3 de 4')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Asignar a Sara P.' }));
    expect(screen.getByText('Posición 4 de 4')).toBeOnTheScreen();

    await fireEvent.press(within(screen.getByTestId('position-row-3')).getByRole('button'));
    expect(screen.getByText('Posición 3 de 4')).toBeOnTheScreen();
    expect(within(screen.getByTestId('position-row-3')).getByText('por asignar', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('toggles Completado in the completion preview', async () => {
    await render(<ThemeProvider>{entry('seriesAssignment').states['completion-off']()}</ThemeProvider>);
    const [first] = screen.getAllByRole('switch');
    expect(first).not.toBeChecked();

    await fireEvent.press(first);

    expect(screen.getAllByRole('switch')[0]).toBeChecked();
  });

  it('opens the exit sheet from the back button while running', async () => {
    await render(<ThemeProvider>{entry('stopwatch').states['exit-confirm']()}</ThemeProvider>);
    expect(screen.queryByText('¿Descartar este tiempo?')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('¿Descartar este tiempo?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir midiendo' }));
    expect(screen.queryByText('¿Descartar este tiempo?')).toBeNull();
  });
});
