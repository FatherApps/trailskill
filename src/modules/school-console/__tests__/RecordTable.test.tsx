import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, type ThemeName } from '../../../core/theme';
import { longTextRecordFixture, recordsFixture } from '../__fixtures__/records';
import { RecordTable, recordTableColors, type RecordTableProps } from '../components/RecordTable';

const themes: ThemeName[] = ['light', 'dark'];
const hidden = { includeHiddenElements: true };

const show = (props: Partial<RecordTableProps> = {}) =>
  render(<RecordTable rows={recordsFixture} pool="SCM" {...props} />);

const measure = (width: number) =>
  fireEvent(screen.getByTestId('record-table'), 'layout', { nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } });

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('RecordTable', () => {
  it('shows one row per event of the pool, with event, best mark, athlete and date', async () => {
    await show();

    expect(screen.getAllByTestId('record-row')).toHaveLength(4);
    expect(screen.getByLabelText('Libre 50, 33 segundos con 91 centésimas, Mateo Castro, 18 oct 2026')).toBeOnTheScreen();
    expect(screen.getByText('Mateo Castro', hidden)).toBeOnTheScreen();
    expect(screen.getByText('18 oct 2026', hidden)).toBeOnTheScreen();
    expect(screen.getByText('33,91', hidden)).toBeOnTheScreen();
    expect(screen.getByText('1:19,66', hidden)).toBeOnTheScreen();
  });

  it('has a header for each column', async () => {
    await show();

    for (const column of ['Prueba', 'Mejor marca', 'Deportista', 'Fecha']) {
      expect(screen.getByText(column, hidden)).toBeOnTheScreen();
    }
  });

  it('orders the columns event, best mark, athlete, date', async () => {
    await show();

    const headers = screen.getAllByText(/^(Prueba|Mejor marca|Deportista|Fecha)$/, hidden).map((node) => node.props.children);
    expect(headers).toEqual(['Prueba', 'Mejor marca', 'Deportista', 'Fecha']);
  });

  it('draws the initials of the athlete before the name', async () => {
    await show({ rows: [recordsFixture[0], longTextRecordFixture] });

    expect(screen.getByText('MC', hidden)).toBeOnTheScreen();
    expect(screen.getByText('MV', hidden)).toBeOnTheScreen();
  });

  it('filters by pool: the rows of the other pool are not shown', async () => {
    await show({ pool: 'LCM' });

    expect(screen.getAllByTestId('record-row')).toHaveLength(2);
    expect(screen.getByText('Julián Ortiz', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('Mateo Castro', hidden)).toBeNull();
    expect(screen.getByText('34,82', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('33,91', hidden)).toBeNull();
  });

  it('shows a dash for an event without a mark, never 0,00', async () => {
    await show();

    expect(screen.getByLabelText('Pecho 50, sin marca')).toBeOnTheScreen();
    // Only the mark: an event without a mark has neither athlete nor date.
    expect(screen.getAllByText('—', hidden)).toHaveLength(1);
    expect(screen.queryByText('0,00', hidden)).toBeNull();
    expect(screen.queryByText('0:00,00', hidden)).toBeNull();
  });

  it('shows a dash for a date that is missing or unreadable', async () => {
    await show({ rows: [{ ...recordsFixture[0], date: 'ayer' }] });

    expect(screen.getByLabelText('Libre 50, 33 segundos con 91 centésimas, Mateo Castro')).toBeOnTheScreen();
    expect(screen.getAllByText('—', hidden)).toHaveLength(1);
  });

  it('always shows the source of an imported record', async () => {
    await show();

    expect(screen.getByText('FEDNAT', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText('Libre 100, 1 minuto, 19 segundos con 66 centésimas, Lucía Ramírez, 12 mar 2025, FEDNAT')).toBeOnTheScreen();
  });

  it('shows an empty state inside the frame when the pool has no rows', async () => {
    await show({ rows: recordsFixture.filter((row) => row.pool === 'LCM'), pool: 'SCM' });

    expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    expect(screen.getByText('Aún no hay récords en esta piscina')).toBeOnTheScreen();
    expect(screen.queryByTestId('record-row')).toBeNull();
  });

  describe('compact', () => {
    it('becomes a list without headers, with the same rows', async () => {
      await show({ compact: true });

      expect(screen.queryByText('Prueba', hidden)).toBeNull();
      expect(screen.getAllByTestId('record-row')).toHaveLength(4);
      expect(screen.getByLabelText('Libre 50, 33 segundos con 91 centésimas, Mateo Castro, 18 oct 2026')).toBeOnTheScreen();
      expect(screen.getByText('Mateo Castro · 18 oct 2026', hidden)).toBeOnTheScreen();
    });

    it('shows a dash for an event without a mark', async () => {
      await show({ compact: true });

      expect(screen.getByLabelText('Pecho 50, sin marca')).toBeOnTheScreen();
      expect(screen.queryByText('0,00', hidden)).toBeNull();
    });

    it('takes over by itself when the table is narrower than it can hold, and back when it is wide enough', async () => {
      await show();
      expect(screen.getByText('Prueba', hidden)).toBeOnTheScreen();

      await measure(400);
      expect(screen.queryByText('Prueba', hidden)).toBeNull();

      await measure(700);
      expect(screen.getByText('Prueba', hidden)).toBeOnTheScreen();
    });
  });

  it('keeps long names and sources whole', async () => {
    await show({ rows: [longTextRecordFixture] });

    expect(screen.getByText('María Fernanda de los Ángeles Restrepo Villegas', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Asociación Departamental de Natación', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Combinado individual 200', hidden)).toBeOnTheScreen();
  });

  it.each(themes)('keeps the text readable on the frame in the %s theme', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c[recordTableColors.text], c[recordTableColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[recordTableColors.header], c[recordTableColors.background])).toBeGreaterThanOrEqual(4.5);
  });

  it('follows the theme', async () => {
    await render(
      <ThemeProvider name="dark">
        <RecordTable rows={recordsFixture} pool="SCM" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('record-table')).toBeOnTheScreen();
  });
});


const svgs = () => screen.container.queryAll((node) => node.type === 'RNSVGSvgView');
const pathData = () => screen.container.queryAll((node) => node.type === 'RNSVGPath').map((node) => node.props.d as string);
// One path that only that stroke draws (as in StrokeIcon.test).
const signature = { FR: 'M12 17c2-7 8-10 13-6', BK: 'M20 18.5 17 5', FL: 'M13.5 17C10.5 6 4.5 4 3 11M18.5 17C21.5 6 27.5 4 29 11' };
// The icon is the Svg's parent box; it is decorative when hidden from screen readers.
const box = (svg: { parent: unknown }) => svg.parent as { props: Record<string, unknown>; parent: { children: unknown[] } };

describe('RecordTable stroke icon', () => {
  const struck = [
    { id: 's1', pool: 'SCM', event: 'Libre 50', stroke: 'FR', time: 3391, athlete: 'Mateo Castro', date: '2026-10-18' },
    { id: 's2', pool: 'SCM', event: 'Espalda 50', stroke: 'BK', time: 4108, athlete: 'Lucía Ramírez', date: '2026-10-02' },
  ] satisfies RecordTableProps['rows'];

  it.each([
    ['table', 1000],
    ['list', 300],
  ])('draws a decorative sm icon with the stroke of each row in the %s form', async (_form, width) => {
    await show({ rows: struck });
    measure(width);

    expect(svgs()).toHaveLength(2);
    expect(svgs().map((svg) => svg.props.width)).toEqual([24, 24]);
    expect(svgs().every((svg) => box(svg).props.accessibilityElementsHidden === true)).toBe(true);
    expect(pathData()).toEqual(expect.arrayContaining([signature.FR, signature.BK]));
    expect(pathData()).not.toContain(signature.FL);
  });

  it.each([
    ['table', 1000],
    ['list', 300],
  ])('draws the icon before the event name in the %s form', async (_form, width) => {
    await show({ rows: [struck[0]] });
    measure(width);

    const group = box(svgs()[0]).parent;
    const name = screen.getByText('Libre 50', hidden);
    expect(group.children.indexOf(box(svgs()[0]) as never)).toBeGreaterThanOrEqual(0);
    expect(group.children.indexOf(box(svgs()[0]) as never)).toBeLessThan(group.children.indexOf(name as never));
  });

  it('draws no icon for a row without a stroke or with a code that has no pictogram', async () => {
    await show({ rows: [{ ...struck[0], stroke: undefined }, { ...struck[1], stroke: 'XX' }] });

    expect(svgs()).toHaveLength(0);
    expect(screen.getByText('Libre 50', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Espalda 50', hidden)).toBeOnTheScreen();
  });

  it('does not repeat the stroke in the accessible label', async () => {
    await show({ rows: [struck[0]] });

    expect(screen.getByLabelText('Libre 50, 33 segundos con 91 centésimas, Mateo Castro, 18 oct 2026')).toBeOnTheScreen();
  });

  it('keeps the event name shrinkable next to the icon so a large font wraps the text, not the icon', async () => {
    jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 2 }));
    await show({ rows: [struck[0]] });

    expect(StyleSheet.flatten(screen.getByText('Libre 50', hidden).props.style)).toMatchObject({ flexShrink: 1 });
    expect(svgs()).toHaveLength(1);
  });
});
