import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '../gallery';

const entry = (id: string) => galleryEntries.find((e) => e.id === id)!;
const themes: ThemeName[] = ['light', 'dark'];

const cases = galleryEntries.flatMap((e) =>
  Object.keys(e.states).flatMap((state) => themes.flatMap((theme) => [1, 2].map((scale) => [e.id, state, theme, scale] as const))),
);

describe('timing gallery entries', () => {
  it('cover setup and every stopwatch state', () => {
    expect(galleryEntries.map((e) => e.id)).toEqual(['timingSetup', 'stopwatch']);
    expect(Object.keys(entry('timingSetup').states)).toEqual(['setup']);
    expect(Object.keys(entry('stopwatch').states)).toEqual([
      'ready',
      'running',
      'running-splits',
      'stopped',
      'stopped-no-pb',
      'exit-confirm',
    ]);
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

  it('shows the personal best with and without a value', async () => {
    await render(<ThemeProvider>{entry('stopwatch').states.stopped()}</ThemeProvider>);
    expect(screen.getByText('MP 34,82')).toBeOnTheScreen();

    await render(<ThemeProvider>{entry('stopwatch').states['stopped-no-pb']()}</ThemeProvider>);
    expect(screen.getByText('MP —')).toBeOnTheScreen();
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
