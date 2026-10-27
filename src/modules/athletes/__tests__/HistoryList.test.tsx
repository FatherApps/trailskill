import { render, screen, within } from '@testing-library/react-native';
import { PixelRatio, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, contrastRatio, size, space, ThemeProvider, type ThemeName } from '../../../core/theme';
import { historyFixture, historyResults } from '../__fixtures__/history';
import { marginOfCard, rowLabel } from '../__fixtures__/historyRows';
import { HistoryList, type HistoryResult } from '../components/HistoryList';

const themes: ThemeName[] = ['light', 'dark'];
const byId = (id: string): HistoryResult => historyResults.find((result) => result.id === id)!;
// Host element types and accessibility labels and texts, in render order.
type Json = { type: string; props: { accessibilityLabel?: string }; children: Json[] | string[] | null };
const flatten = (node: unknown): string[] => {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node === 'string') return [node];
  const { type, props, children } = node as Json;
  return [type, ...(props.accessibilityLabel ? [props.accessibilityLabel] : []), ...flatten(children)];
};
const hidden = { includeHiddenElements: true };
// The two rows the tests look at, by title (the race-pb and the import results) and by row label.
const raceTitle = 'Libre 50 m';
const importTitle = 'Mariposa 100 m';
const raceRow = rowLabel(raceTitle);
const importRow = rowLabel(importTitle);
const hiddenText = (text: string | RegExp) => screen.queryAllByText(text, hidden);

describe('HistoryList', () => {
  // Jest reports a system font scale of 2; the tests run at the system's normal size unless they say otherwise.
  beforeEach(() => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  });
  afterEach(() => jest.restoreAllMocks());

  it('renders nothing without results', async () => {
    await render(<HistoryList results={[]} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('says a result without a sync state is online only', async () => {
    const withoutState = { ...byId('race-pb'), origin: 'other_school' as const, syncState: undefined };
    await render(
      <ThemeProvider>
        <HistoryList results={[withoutState]} />
      </ThemeProvider>,
    );

    expect(hiddenText('Solo en línea')).toHaveLength(1);
    expect(screen.getByLabelText(/Otra escuela, .*Solo en línea$/)).toBeOnTheScreen();
  });

  it('is virtualized: it renders only the first window of a long history', async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ ...byId('race-pb'), id: `r-${index}` }));
    await render(<HistoryList results={many} />);

    const rows = screen.getAllByLabelText(raceRow);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(many.length);
  });

  it.each([
    ['race-pb', 'Libre 50 m, 18 de octubre de 2026, Competencia, 34 segundos con 82 centésimas, Marca personal, Enviado'],
    ['repetition', 'Libre 50 m, 16 de octubre de 2026, Entrenamiento, Rep. 3, 35 segundos con 73 centésimas, Enviado'],
    [
      'series-total',
      'Libre 200 m, 16 de octubre de 2026, Entrenamiento, Total serie, 2 minutos, 33 segundos con 80 centésimas, Enviado',
    ],
    ['split', 'Libre 100 m, 11 de octubre de 2026, Competencia, Parcial 25 m, 16 segundos con 40 centésimas, Enviado'],
    ['completed', 'Espalda 100 m, 9 de octubre de 2026, Entrenamiento, Completado, sin tiempo, Enviado'],
    ['missing-time', 'Pecho 50 m, 9 de octubre de 2026, Entrenamiento, Sin registro, Enviado'],
    ['on-device', 'Mariposa 50 m, 24 de octubre de 2026, Entrenamiento, 41 segundos con 20 centésimas, En el teléfono'],
    [
      'not-sent',
      'Combinado 200 m, 24 de octubre de 2026, Entrenamiento, 2 minutos, 42 segundos con 10 centésimas, No enviado',
    ],
    ['import', 'Mariposa 100 m, 7 de marzo de 2026, Competencia, FEDNAT, 1 minuto, 18 segundos con 55 centésimas, Enviado'],
    [
      'external-timer',
      'Pecho 100 m, 20 de septiembre de 2026, Entrenamiento, Botón externo, 1 minuto, 22 segundos con 10 centésimas, Enviado',
    ],
    [
      'other-school',
      'Espalda 50 m, 15 de agosto de 2026, Competencia, Otra escuela: Club Acuático Norte, 39 segundos con 5 centésimas, Enviado',
    ],
  ])('makes the %s row one accessible element with a composed label', async (id, label) => {
    await render(<HistoryList results={[byId(id)]} />);

    expect(screen.getByLabelText(label)).toBeOnTheScreen();
    // The row label says everything: its parts are hidden from screen readers.
    expect(screen.queryAllByText(/./)).toHaveLength(0);
    expect(hiddenText(/./).length).toBeGreaterThan(0);
  });

  it('labels repetition, series total, split and race differently', async () => {
    await render(<HistoryList results={['race-pb', 'repetition', 'series-total', 'split'].map(byId)} />);

    expect(hiddenText(/18 oct 2026 · Competencia$/)).toHaveLength(1);
    expect(hiddenText('16 oct 2026 · Entrenamiento · Rep. 3')).toHaveLength(1);
    expect(hiddenText('16 oct 2026 · Entrenamiento · Total serie')).toHaveLength(1);
    expect(hiddenText('11 oct 2026 · Competencia · Parcial 25 m')).toHaveLength(1);
  });

  it('shows the origin as text for each origin but the own one', async () => {
    await render(<HistoryList results={['race-pb', 'import', 'external-timer', 'other-school'].map(byId)} />);

    expect(hiddenText(historyFixture.sourceName)).toHaveLength(1);
    expect(hiddenText('Botón externo')).toHaveLength(1);
    expect(hiddenText(`Otra escuela: ${historyFixture.otherSchool}`)).toHaveLength(1);
  });

  it.each([
    ['race-pb', 'lime'],
    ['repetition', 'sky'],
    ['import', 'surface-2'],
    ['external-timer', 'lilac'],
    ['other-school', 'coral'],
  ] as const)('draws the %s row with a %s dot and an icon, from the theme tokens', async (id, token) => {
    await render(<HistoryList results={[byId(id)]} />);

    const [dot] = screen.getAllByTestId('history-dot', { includeHiddenElements: true });
    expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe(colors.light[token]);
    expect(dot.queryAll((node) => node.type === 'RNSVGPath')).toHaveLength(1);
  });

  it('has a dot on every row, so no row shows the origin by colour alone', async () => {
    await render(<HistoryList results={['race-pb', 'import', 'external-timer', 'other-school'].map(byId)} />);

    expect(screen.getAllByTestId('history-dot', { includeHiddenElements: true })).toHaveLength(4);
    expect(hiddenText(historyFixture.sourceName)).toHaveLength(1);
  });

  it('insets the rows from the edges when asked, so a full-bleed header can sit above', async () => {
    await render(<HistoryList results={[byId('race-pb')]} inset={space[4]} />);

    // The margin is the card's: the row's nearest ancestor with a background, however the components nest above it.
    expect(marginOfCard(screen.getByLabelText(raceRow))).toBe(space[4]);
  });

  it('shows no origin for an own result', async () => {
    await render(<HistoryList results={[byId('race-pb')]} />);

    for (const origin of ['Importado', 'Botón externo', /Otra escuela/, historyFixture.sourceName]) {
      expect(hiddenText(origin)).toHaveLength(0);
    }
  });

  it('falls back to a generic origin text when the data has no source name', async () => {
    await render(
      <HistoryList
        results={[
          { ...byId('import'), sourceName: undefined },
          { ...byId('other-school'), sourceName: undefined },
        ]}
      />,
    );

    expect(hiddenText('Importado')).toHaveLength(1);
    expect(hiddenText('Otra escuela')).toHaveLength(1);
  });

  it('shows a missing time as "—", never as 0,00', async () => {
    await render(<HistoryList results={[byId('missing-time')]} />);

    expect(hiddenText('—')).toHaveLength(1);
    expect(hiddenText(/0,00/)).toHaveLength(0);
    expect(screen.getByLabelText(/Sin registro/)).toBeOnTheScreen();
  });

  it('shows "Completado" for a result completed without a time', async () => {
    await render(<HistoryList results={[byId('completed')]} />);

    expect(hiddenText('Completado')).toHaveLength(1);
    expect(hiddenText('—')).toHaveLength(0);
    expect(hiddenText(/0,00/)).toHaveLength(0);
  });

  it('marks a personal best with MP', async () => {
    await render(<HistoryList results={[byId('race-pb'), byId('repetition')]} />);

    expect(hiddenText('MP')).toHaveLength(1);
  });

  it('shows the real sync state of each row, "Enviado" included', async () => {
    await render(
      <HistoryList
        results={[
          byId('on-device'),
          { ...byId('repetition'), id: 'sending', syncState: 'sending' },
          byId('repetition'),
          byId('not-sent'),
        ]}
      />,
    );

    expect(screen.queryAllByTestId('sync-status', { includeHiddenElements: true })).toHaveLength(4);
    for (const state of ['En el teléfono', 'Enviando', 'Enviado', 'No enviado']) {
      expect(hiddenText(state)).toHaveLength(1);
    }
  });

  it('uses the date helper: a malformed date is left out of the label', async () => {
    await render(<HistoryList results={[{ ...byId('race-pb'), date: 'ayer' }]} />);

    expect(
      screen.getByLabelText('Libre 50 m, Competencia, 34 segundos con 82 centésimas, Marca personal, Enviado'),
    ).toBeOnTheScreen();
  });

  it('gives every row at least the minimum touch target height and no fixed width', async () => {
    await render(<HistoryList results={[byId('race-pb')]} />);

    const style = StyleSheet.flatten(screen.getByLabelText(raceRow).props.style);
    expect(style.minHeight).toBe(size['target-min']);
    expect(style.width).toBeUndefined();
  });

  // Jest has no layout engine: these tests pin the styles that produce the layout, not the layout itself. The real
  // wrapping at 200 % is checked visually, in the screenshot.
  describe('large text', () => {
    const rowStyle = () => StyleSheet.flatten(screen.getByLabelText(raceRow).props.style);
    const flat = (style: unknown) => StyleSheet.flatten(style as never);
    // The parts of the one row, found through what they hold (the hidden parts need includeHiddenElements).
    // `hasSyncState` says which of the two things the trailing block holds is looked up: the sync status of a result
    // with a sync state, or the "Solo en línea" caption of one without it. A wrong value fails on that lookup.
    // shortcut: the text block and the trailing block have no testID, role or label, so each is the parent of the one
    // thing it holds (the title; the sync status or the caption), and the two lookups share that parent. That breaks
    // if another view wraps that thing; a stable hook needs a production testID, which the maintainer has to approve.
    const partsOf = (row: ReturnType<typeof screen.getAllByLabelText>[number], title: string, hasSyncState = true) => {
      const head = within(row).getByTestId('history-head', hidden);
      const syncStatus = hasSyncState
        ? within(row).getByTestId('sync-status', hidden)
        : within(row).getByText('Solo en línea', hidden);
      return {
        head,
        dot: within(head).getByTestId('history-dot', hidden),
        text: within(head).getByText(title, hidden).parent!,
        trailing: syncStatus.parent!,
      };
    };

    it('lets the text block shrink and keeps the time width at normal size', async () => {
      await render(<HistoryList results={[byId('import')]} />);

      const { text, trailing } = partsOf(screen.getByLabelText(importRow), importTitle);
      expect(flat(text.props.style).flexShrink).toBe(1);
      expect(flat(text.props.style).minWidth).toBe(0);
      expect(flat(trailing.props.style).flexShrink).toBe(0);
    });

    it('finds the trailing block of a row without a sync state, whose caption is online only', async () => {
      await render(<HistoryList results={[{ ...byId('race-pb'), syncState: undefined }]} />);

      const { trailing } = partsOf(screen.getByLabelText(raceRow), raceTitle, false);
      expect(flat(trailing.props.style).flexShrink).toBe(0);
      expect(within(trailing).getByText('Solo en línea', hidden)).toBeOnTheScreen();
    });

    it.each([1, 2])('keeps the origin dot in the same row as the text at font scale %s', async (fontScale) => {
      await render(
        <ThemeProvider fontScale={fontScale}>
          <HistoryList results={[byId('import')]} />
        </ThemeProvider>,
      );

      // The dot and the text share one row (the head), so the origin never adds a row of its own; the time stays out of it.
      const { head, dot, text, trailing } = partsOf(screen.getByLabelText(importRow), importTitle);
      expect(flat(head.props.style).flexDirection).toBe('row');
      expect(dot.parent).toBe(head);
      expect(text.parent).toBe(head);
      // The origin is a line of the text block, not a child of the row or of the head: it must not add a row of its own.
      expect(within(text).getByText(historyFixture.sourceName, hidden)).toBeOnTheScreen();
      expect(within(head).queryByTestId('sync-status', hidden)).toBeNull();
      expect(trailing).not.toBe(head);
    });

    it('keeps the text sharing the row with the dot, wrapping at the row width minus the dot, at 200 %', async () => {
      await render(
        <ThemeProvider fontScale={2}>
          <HistoryList results={[byId('import')]} />
        </ThemeProvider>,
      );

      // The wrapping itself cannot be measured here: the styles that produce it are pinned.
      // The head fills the row (stretch) and holds the dot and the text; the text takes what the dot leaves (basis 0,
      // shrinkable) instead of the full row width.
      const row = screen.getByLabelText(importRow);
      expect(flat(row.props.style).alignItems).toBe('stretch');
      const { head, dot, text } = partsOf(row, importTitle);
      expect(flat(head.props.style).flexDirection).toBe('row');
      expect(flat(head.props.style).flexGrow).toBeUndefined();
      expect(flat(dot.props.style).flexShrink).toBe(0);
      expect(flat(text.props.style)).toMatchObject({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 });
    });

    it.each([1, 2])('hides the head from screen readers: the row label says it, at font scale %s', async (fontScale) => {
      await render(
        <ThemeProvider fontScale={fontScale}>
          <HistoryList results={[byId('import')]} />
        </ThemeProvider>,
      );

      const [head] = screen.getAllByTestId('history-head', { includeHiddenElements: true });
      expect(head.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(head.props.accessibilityElementsHidden).toBe(true);
    });

    it('keeps the time beside the text at normal size', async () => {
      await render(<HistoryList results={[byId('race-pb')]} />);

      expect(rowStyle().flexDirection).toBe('row');
    });

    it('puts the time below the text at 200 % so words are never split', async () => {
      await render(
        <ThemeProvider fontScale={2}>
          <HistoryList results={[byId('race-pb')]} />
        </ThemeProvider>,
      );

      expect(rowStyle().flexDirection).toBe('column');
      expect(rowStyle().alignItems).toBe('stretch');
      expect(flat(partsOf(screen.getByLabelText(raceRow), raceTitle).trailing.props.style).alignItems).toBe(
        'flex-start',
      );
    });
  });

  describe('header and footer', () => {
    it('renders the header above the rows and the footer below them, inside the one list', async () => {
      await render(
        <HistoryList results={[byId('race-pb')]} header={<Text>Encabezado</Text>} footer={<Text>Pie</Text>} />,
      );

      expect(screen.getByText('Encabezado')).toBeOnTheScreen();
      expect(screen.getByText('Pie')).toBeOnTheScreen();
      const flat = flatten(screen.toJSON());
      // One scroll container: the header and footer scroll with the rows.
      expect(flat.filter((item) => item === 'RCTScrollView')).toHaveLength(1);
      expect(flat.indexOf('Encabezado')).toBeLessThan(flat.findIndex((item) => raceRow.test(item)));
      expect(flat.findIndex((item) => raceRow.test(item))).toBeLessThan(flat.indexOf('Pie'));
    });

    it('still renders the header and footer without results', async () => {
      await render(<HistoryList results={[]} header={<Text>Encabezado</Text>} footer={<Text>Pie</Text>} />);

      expect(screen.getByText('Encabezado')).toBeOnTheScreen();
      expect(screen.getByText('Pie')).toBeOnTheScreen();
    });

    it('fills the height it is given when it scrolls, so the list is bounded', async () => {
      const rootStyle = () =>
        StyleSheet.flatten((screen.toJSON() as unknown as { props: { style: StyleProp<ViewStyle> } }).props.style);

      await render(<HistoryList results={[byId('race-pb')]} />);
      expect(rootStyle()?.flex).toBe(1);

      await screen.unmount();
      await render(<HistoryList results={[byId('race-pb')]} scrollEnabled={false} />);
      expect(rootStyle()?.flex).toBeUndefined();
    });
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    it('keeps ink and ink-muted readable on the card surface', () => {
      const c = colors[theme];
      expect(contrastRatio(c.ink, c['surface-1'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c['ink-muted'], c['surface-1'])).toBeGreaterThanOrEqual(4.5);
    });

    it.each([
      ['on-color', 'lime'],
      ['on-color', 'sky'],
      ['on-color', 'lilac'],
      ['on-color', 'coral'],
      ['ink', 'surface-2'],
    ] as const)('keeps the %s icon on the %s dot at 3:1 or more', (icon, dot) => {
      expect(contrastRatio(colors[theme][icon], colors[theme][dot])).toBeGreaterThanOrEqual(3);
    });
  });
});
