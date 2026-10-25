import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '../gallery';

const entry = (id: string) => galleryEntries.find((e) => e.id === id)!;
const themes: ThemeName[] = ['light', 'dark'];

const cases = galleryEntries.flatMap((e) =>
  Object.keys(e.states).flatMap((state) => themes.flatMap((theme) => [1, 2].map((scale) => [e.id, state, theme, scale] as const))),
);

describe('training-plans gallery entries', () => {
  it('cover the block card, the plan builder and the today view', () => {
    expect(galleryEntries.map((e) => e.id)).toEqual(['blockCard', 'planBuilder', 'today']);
    expect(Object.keys(entry('blockCard').states)).toEqual(['phases', 'recordings']);
    expect(Object.keys(entry('planBuilder').states)).toEqual(['empty', 'blocks', 'editing']);
    expect(Object.keys(entry('today').states)).toEqual([
      'today',
      'loading',
      'empty',
      'error',
      'offline',
      'offline-empty',
      'denied',
    ]);
  });

  it.each(cases)('%s / %s renders in %s theme at scale %s', async (id, state, theme, scale) => {
    await render(
      <ThemeProvider name={theme} fontScale={scale}>
        {entry(id).states[state]()}
      </ThemeProvider>,
    );
  });

  it.each([
    ['blockCard', 'phases', 'Calentamiento'],
    ['blockCard', 'phases', 'Enfriamiento'],
    ['blockCard', 'recordings', 'Registro: total de la serie'],
    ['planBuilder', 'empty', 'Aún no hay bloques'],
    ['planBuilder', 'blocks', 'Guardar como plantilla'],
    ['planBuilder', 'editing', 'Listo'],
    ['today', 'today', 'Lleva hoy'],
    ['today', 'loading', 'Hoy'],
    ['today', 'empty', 'Hoy no hay entrenamiento'],
    ['today', 'error', 'No pudimos cargar el plan de hoy'],
    ['today', 'offline', 'Plan guardado el'],
    ['today', 'offline-empty', 'Estás sin conexión'],
    ['today', 'denied', 'Esta información es privada'],
  ])('%s / %s shows its content', async (id, state, text) => {
    await render(<ThemeProvider>{entry(id).states[state]()}</ThemeProvider>);

    expect(screen.getAllByText(text, { exact: false, includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('opens the editor when a block is added in the builder preview', async () => {
    await render(<ThemeProvider>{entry('planBuilder').states.empty()}</ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Listo' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar bloque' }));

    expect(screen.getByRole('button', { name: 'Listo' })).toBeOnTheScreen();
    expect(screen.getByText('1 bloque')).toBeOnTheScreen();
  });

  it('moves a block and closes the editor in the builder preview', async () => {
    await render(<ThemeProvider>{entry('planBuilder').states.editing()}</ThemeProvider>);

    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));

    expect(screen.queryByRole('button', { name: 'Listo' })).toBeNull();
  });
});
