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
    expect(galleryEntries.map((e) => e.id)).toEqual(['blockCard', 'planBuilder', 'today', 'fulfillment']);
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
    expect(Object.keys(entry('fulfillment').states)).toEqual([
      'grid',
      'many-blocks',
      'loading',
      'empty-athletes',
      'empty-blocks',
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
    ['today', 'empty', 'Hoy no hay plan'],
    ['today', 'error', 'No pudimos cargar el plan de hoy'],
    ['today', 'offline', 'Plan guardado el'],
    ['today', 'offline-empty', 'Estás sin conexión'],
    ['today', 'denied', 'Esta información es privada'],
    ['fulfillment', 'grid', 'Toca una celda para cambiar su estado.'],
    ['fulfillment', 'many-blocks', 'Toca una celda para cambiar su estado.'],
    ['fulfillment', 'loading', 'Cumplimiento · 24 oct'],
    ['fulfillment', 'empty-athletes', 'Aún no hay deportistas en este plan'],
    ['fulfillment', 'empty-blocks', 'Este plan no tiene bloques'],
    ['fulfillment', 'error', 'No pudimos cargar el cumplimiento'],
    ['fulfillment', 'offline', 'Las marcas se guardan en la tableta'],
    ['fulfillment', 'offline-empty', 'El cumplimiento aparecerá cuando vuelva la señal.'],
    ['fulfillment', 'denied', 'Solo los entrenadores del grupo'],
  ])('%s / %s shows its content', async (id, state, text) => {
    await render(<ThemeProvider>{entry(id).states[state]()}</ThemeProvider>);

    expect(screen.getAllByText(text, { exact: false, includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('cycles a cell of the fulfillment preview to the next status', async () => {
    await render(<ThemeProvider>{entry('fulfillment').states.grid()}</ThemeProvider>);
    const lucia = () => screen.getByRole('button', { name: /^Lucía R\. · Bloque 1,/ });
    expect(lucia().props.accessibilityLabel).toContain(': Hecho');

    await fireEvent.press(lucia());
    expect(lucia().props.accessibilityLabel).toContain(': Parcial · 1 de 1');

    await fireEvent.press(lucia());
    expect(lucia().props.accessibilityLabel).toContain(': No asistió');
    expect(lucia().props.accessibilityLabel).toContain('Corregido por Paula G. · 24 oct');
  });

  it('opens the editor when a block is added in the builder preview', async () => {
    await render(<ThemeProvider>{entry('planBuilder').states.empty()}</ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Listo' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar bloque' }));

    expect(screen.getByRole('button', { name: 'Listo' })).toBeOnTheScreen();
    expect(screen.getByText('1 bloque')).toBeOnTheScreen();
  });

  it('moves a block down in the builder preview', async () => {
    await render(<ThemeProvider>{entry('planBuilder').states.blocks()}</ThemeProvider>);
    const summaries = () => screen.getAllByText(/^\d+ × \d+ m /).map((n) => n.props.children);
    const [first, second] = summaries();
    expect(first).toBe('1 × 200 m Libre');
    expect(second).toBe('8 × 50 m Libre');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Bajar' })[0]);

    expect(summaries().slice(0, 2)).toEqual([second, first]);
    expect(screen.getAllByRole('button', { name: 'Subir' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Bajar' })).toHaveLength(4);
  });

  it('closes the editor in the builder preview', async () => {
    await render(<ThemeProvider>{entry('planBuilder').states.editing()}</ThemeProvider>);

    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));

    expect(screen.queryByRole('button', { name: 'Listo' })).toBeNull();
  });
});
