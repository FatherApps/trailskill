import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

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
