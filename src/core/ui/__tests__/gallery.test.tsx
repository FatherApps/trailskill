import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemeProvider, type ThemeName } from '../../theme';
import { galleryEntries, iconPaths } from '..';

const themes: ThemeName[] = ['light', 'dark'];
const scales = [1, 2];

const entryById = (id: string) => galleryEntries.find((entry) => entry.id === id)!;
const stateKeys = (id: string) => Object.keys(entryById(id).states);

const cases = galleryEntries.flatMap((entry) =>
  Object.keys(entry.states).flatMap((state) =>
    themes.flatMap((theme) => scales.map((scale) => [entry.id, state, theme, scale] as const)),
  ),
);

describe('core/ui gallery entries', () => {
  it('have unique ids', () => {
    const ids = galleryEntries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cover every core/ui component with all its states', () => {
    expect(stateKeys('textField')).toEqual(['rest', 'help', 'error', 'protected']);
    expect(stateKeys('tag')).toEqual(['neutral', 'outline', 'info', 'ok', 'warn']);
    expect(stateKeys('icon')).toEqual(['icon-md', 'icon-sm']);
    expect(stateKeys('stepHeader')).toEqual(['first', 'middle', 'last']);
    expect(stateKeys('stateView')).toEqual(['loading', 'empty', 'empty-group', 'error', 'offline', 'denied']);
    expect(stateKeys('syncStatus')).toEqual(['on_device', 'sending', 'synced', 'not_sent', 'not_sent con mensaje']);
    expect(stateKeys('confirmSheet')).toEqual(['stop', 'primary', 'signOut', 'discardIncomplete', 'signOutOffline']);
    expect(stateKeys('segmented')).toEqual(['strokes', 'distances', 'long-text']);
    expect(stateKeys('timeValue')).toEqual([
      'time-lg',
      'time-md',
      'time-sm',
      'missing',
      'decimal-point',
      'faster',
      'slower',
      'completed',
    ]);
    expect(stateKeys('swimmerRow')).toEqual([
      'normal',
      'selected',
      'missing-authorization',
      'chevron',
      'missing-time',
      'long-text',
    ]);
    expect(stateKeys('navBar')).toEqual(['home-active', 'times-active', 'long-labels']);
  });

  it.each(cases)('%s / %s renders in %s theme at scale %s', async (id, state, theme, scale) => {
    await render(<ThemeProvider name={theme} fontScale={scale}>{entryById(id).states[state]()}</ThemeProvider>);
  });

  it.each(['stepHeader', 'stateView', 'segmented', 'swimmerRow', 'navBar'].flatMap((id) => stateKeys(id).map((state) => [id, state])))(
    '%s / %s fills the width of the preview',
    async (id, state) => {
      await render(<ThemeProvider>{entryById(id).states[state]()}</ThemeProvider>);

      const root = screen.toJSON() as unknown as { props: { style: StyleProp<ViewStyle> } };
      expect(StyleSheet.flatten(root.props.style)?.alignSelf).toBe('stretch');
    },
  );

  it('renders every icon of the set with its name', async () => {
    await render(<ThemeProvider>{entryById('icon').states['icon-md']()}</ThemeProvider>);

    for (const name of Object.keys(iconPaths)) expect(screen.getAllByText(name)).toHaveLength(1);
  });

  it.each([
    ['stop', '¿Descartar este tiempo?', 'Seguir revisando'],
    ['primary', '¿Confirmar la importación?', 'Revisar de nuevo'],
    ['signOut', '¿Cerrar sesión con registros sin enviar?', 'Seguir y enviar'],
    ['discardIncomplete', '¿Terminar de descartar?', 'Cerrar sesión'],
    ['signOutOffline', '¿Cerrar sesión con registros sin enviar?', 'Seguir y enviar'],
  ])('shows the %s confirm sheet only after pressing the button', async (state, title, cancel) => {
    await render(<ThemeProvider>{entryById('confirmSheet').states[state]()}</ThemeProvider>);
    expect(screen.queryByText(title)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar hoja' }));
    expect(screen.getByText(title)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: cancel }));
    expect(screen.queryByText(title)).toBeNull();
  });

  it.each([
    ['strokes', 'Libre', 'Espalda'],
    ['distances', '25 m', '50 m'],
  ])('segmented / %s starts on %s and moves the selection to %s when tapped', async (state, first, second) => {
    await render(<ThemeProvider>{entryById('segmented').states[state]()}</ThemeProvider>);
    expect(screen.getByRole('radio', { name: first })).toBeSelected();

    await fireEvent.press(screen.getByRole('radio', { name: second }));

    expect(screen.getByRole('radio', { name: second })).toBeSelected();
    expect(screen.getByRole('radio', { name: first })).not.toBeSelected();
  });

  it('segmented / strokes and distances use the sport catalog names', async () => {
    await render(<ThemeProvider>{entryById('segmented').states.strokes()}</ThemeProvider>);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    for (const label of ['Libre', 'Espalda', 'Pecho']) {
      expect(screen.getByRole('radio', { name: label })).toBeOnTheScreen();
    }
  });

  it.each([
    ['time-lg', '34,82'],
    ['time-md', '1:12,40'],
    ['time-sm', '16,40'],
    ['missing', '—'],
    ['decimal-point', '34.82'],
    ['faster', '34,82'],
    ['faster', 'MP'],
    ['faster', '−0,91 vs MP'],
    ['slower', '1:12,40'],
    ['slower', '+1,05 vs MP'],
    ['completed', 'Completado'],
  ])('timeValue / %s shows %s', async (state, text) => {
    await render(<ThemeProvider>{entryById('timeValue').states[state]()}</ThemeProvider>);

    expect(screen.getByText(text, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it.each([
    ['normal', 'Lucía R., Infantil B · 3 tiempos este mes, marca personal 34,82, MP 50 L'],
    ['selected', 'Mateo C., Infantil B · 5 tiempos este mes, marca personal 33,91, MP 50 L'],
    ['missing-authorization', 'Sara P., Juvenil A, Consentimiento'],
    ['chevron', 'Tomás V., Máster · Se registró él mismo'],
    ['missing-time', 'Lucía R., Infantil B · 3 tiempos este mes, sin marca personal, MP 100 E'],
  ])('swimmerRow / %s is one row labelled "%s"', async (state, label) => {
    await render(<ThemeProvider>{entryById('swimmerRow').states[state]()}</ThemeProvider>);

    expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
  });

  it('swimmerRow / selected is the only selected row', async () => {
    await render(<ThemeProvider>{entryById('swimmerRow').states.selected()}</ThemeProvider>);
    expect(screen.getByRole('button')).toBeSelected();

    await render(<ThemeProvider>{entryById('swimmerRow').states.normal()}</ThemeProvider>);
    expect(screen.getByRole('button')).not.toBeSelected();
  });

  it.each([
    ['home-active', 'Inicio', 'Tiempos'],
    ['times-active', 'Tiempos', 'Cuenta'],
    ['long-labels', 'Nadadores de mi grupo', 'Cuenta y autorizaciones'],
  ])('navBar / %s starts on %s and moves the active item to %s when it is tapped', async (state, first, second) => {
    await render(<ThemeProvider>{entryById('navBar').states[state]()}</ThemeProvider>);
    expect(screen.getByRole('tab', { name: first })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: second }));

    expect(screen.getByRole('tab', { name: second })).toBeSelected();
    expect(screen.getByRole('tab', { name: first })).not.toBeSelected();
  });
});
