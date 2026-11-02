import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { processColor, StyleSheet } from 'react-native';

import { colors, ThemeProvider, typography, type ColorToken, type ThemeName } from '../../../core/theme';
import {
  progressChartMinutes,
  progressChartOneResult,
  progressChartResults,
  progressChartToday,
  progressChartTwoResults,
  progressChartWithSeriesTotal,
  progressChartWithoutTime,
} from '../__fixtures__/progressChart';
import { ProgressChart } from '../components/ProgressChart';
import type { HistoryResult } from '../components/HistoryList';

const hidden = { includeHiddenElements: true };
const byId = (id: string) => screen.getByTestId(id, hidden);
const maybeById = (id: string) => screen.queryByTestId(id, hidden);
// The colour as the native view receives it.
const argb = (value: string) => (processColor(value) as number) >>> 0;
const paint = (node: { props: Record<string, unknown> }, prop: 'fill' | 'stroke') =>
  (node.props[prop] as { payload: number } | null)?.payload;

async function show(results: readonly HistoryResult[], theme: ThemeName = 'light') {
  await render(
    <ThemeProvider name={theme}>
      <ProgressChart results={results} today={progressChartToday} />
    </ThemeProvider>,
  );
}

const token = (name: ColorToken, theme: ThemeName = 'light') => argb(colors[theme][name]);
const allNodes = (node: unknown): { type: string; props: Record<string, unknown> }[] => {
  if (!node || typeof node !== 'object') return [];
  const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] };
  return [...(n.type ? [{ type: n.type, props: n.props ?? {} }] : []), ...(n.children ?? []).flatMap(allNodes)];
};
// Only what the chart draws: the icons of the empty state are svg too.
const svgNodes = () =>
  allNodes(screen.toJSON()).filter((n) => n.type.startsWith('RNSVG') && String(n.props.testID).startsWith('chart-'));

describe('ProgressChart', () => {
  describe('axis', () => {
    it('says the fastest is up and reads the ticks as times', async () => {
      await show(progressChartResults);

      expect(screen.getByText('Más rápido hacia arriba')).toBeOnTheScreen();
      for (const tick of ['34,00', '36,00', '38,00']) expect(screen.getByText(tick, hidden)).toBeOnTheScreen();
    });

    it('draws a faster time higher and the fastest tick at the top', async () => {
      await show(progressChartResults);

      const cy = (id: string) => byId(`chart-marker-${id}`).props.cy as number;
      expect(cy('p7')).toBeLessThan(cy('p1'));
      expect(cy('p7')).toBeLessThan(cy('p4'));
      const firstTickY = byId('chart-grid-0').props.y1 as number;
      const lastTickY = byId('chart-grid-2').props.y1 as number;
      expect(firstTickY).toBeLessThan(lastTickY);
      expect(screen.getByText('34,00', hidden)).toBeOnTheScreen();
    });

    it('writes the ticks of a long event with minutes', async () => {
      await show(progressChartMinutes);

      expect(screen.getByText('2:28,00', hidden)).toBeOnTheScreen();
    });

    it('draws 3 or 4 horizontal lines and no vertical one, with axis text of 12 px at least', async () => {
      await show(progressChartResults);

      const lines = svgNodes().filter((n) => n.type === 'RNSVGLine' && String(n.props.testID).startsWith('chart-grid'));
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(4);
      // Every line of the chart, the grid and the personal best, is horizontal.
      for (const line of svgNodes().filter((n) => n.type === 'RNSVGLine')) expect(line.props.y1).toBe(line.props.y2);
      for (const line of lines) expect(paint(line, 'stroke')).toBe(token('viz-grid'));
      const axis = StyleSheet.flatten(screen.getByText('34,00', hidden).props.style);
      expect(axis.fontSize).toBeGreaterThanOrEqual(12);
      expect(axis.color).toBe(colors.light['viz-axis']);
      expect(StyleSheet.flatten(screen.getByText('may', hidden).props.style).fontSize).toBeGreaterThanOrEqual(12);
    });
  });

  describe('points', () => {
    it('draws competition filled and training hollow, in the series colour', async () => {
      await show(progressChartResults);

      const competition = byId('chart-marker-p3');
      expect(paint(competition, 'fill')).toBe(token('viz-series-1'));
      expect(competition.props.stroke).toBeUndefined();
      const training = byId('chart-marker-p1');
      expect(paint(training, 'fill')).toBe(token('surface-1'));
      expect(paint(training, 'stroke')).toBe(token('viz-series-1'));
    });

    it('does not use the origin as a third colour', async () => {
      await show(progressChartResults);

      // p3 is imported, p5 comes from an external timer, p7 is its own: all competition, all the same.
      expect(paint(byId('chart-marker-p3'), 'fill')).toBe(paint(byId('chart-marker-p5'), 'fill'));
      expect(byId('chart-marker-p3').props.r).toBe(byId('chart-marker-p5').props.r);
    });

    it('marks the personal best with a dashed line, a larger dot and the label with the time', async () => {
      await show(progressChartResults);

      const line = byId('chart-best-line');
      expect(paint(line, 'stroke')).toBe(token('viz-best'));
      expect(line.props.strokeDasharray).toEqual(['4', '4']);
      const dot = byId('chart-marker-p7');
      expect(paint(dot, 'fill')).toBe(token('viz-best'));
      expect(dot.props.r).toBeGreaterThan(byId('chart-marker-p3').props.r as number);
      expect(line.props.y1).toBe(dot.props.cy);
      expect(screen.getByText('MP 34,82', hidden)).toBeOnTheScreen();
    });

    it('draws no personal best when no result is one', async () => {
      await show(progressChartResults.map((r) => ({ ...r, isPersonalBest: false })));

      expect(maybeById('chart-best-line')).toBeNull();
      expect(screen.queryByText(/^MP /, hidden)).toBeNull();
    });

    it('draws the series in the main colour, 3.5 thick with round joins, and no second one', async () => {
      await show(progressChartResults);

      const series = svgNodes().filter((n) => n.type === 'RNSVGPath');
      expect(series).toHaveLength(1);
      expect(paint(series[0]!, 'stroke')).toBe(token('viz-series-1'));
      expect(series[0]!.props.strokeWidth).toBe(3.5);
      expect(series[0]!.props.strokeLinecap).toBe(1);
      expect(series[0]!.props.strokeLinejoin).toBe(1);
    });

    it('takes the colours of the dark theme from its tokens', async () => {
      await show(progressChartResults, 'dark');

      expect(paint(byId('chart-marker-p3'), 'fill')).toBe(token('viz-series-1', 'dark'));
      expect(paint(byId('chart-best-line'), 'stroke')).toBe(token('viz-best', 'dark'));
      expect(paint(byId('chart-reserved'), 'fill')).toBe(token('viz-reserved', 'dark'));
    });
  });

  describe('few or no results', () => {
    it('shows the empty state for no results', async () => {
      await show([]);

      expect(screen.getByText('Aún no hay tiempos para graficar')).toBeOnTheScreen();
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(svgNodes()).toHaveLength(0);
    });

    it.each([
      ['one result', progressChartOneResult],
      ['two results', progressChartTwoResults],
    ])('draws only points and asks for more measurements with %s', async (_name, results) => {
      await show(results);

      expect(screen.getByText('Necesitamos más mediciones para ver una tendencia')).toBeOnTheScreen();
      expect(svgNodes().filter((n) => n.type === 'RNSVGPath')).toHaveLength(0);
      expect(svgNodes().filter((n) => String(n.props.testID).startsWith('chart-marker'))).toHaveLength(results.length);
    });

    it('draws the whole series with 3 or more results and no request for more', async () => {
      await show(progressChartResults);

      expect(svgNodes().filter((n) => n.type === 'RNSVGPath')).toHaveLength(1);
      expect(screen.queryByText('Necesitamos más mediciones para ver una tendencia')).toBeNull();
    });

    it('neither draws nor counts a result without a time, and never as zero', async () => {
      await show(progressChartWithoutTime);

      expect(maybeById('chart-marker-no-time')).toBeNull();
      expect(maybeById('chart-marker-null-time')).toBeNull();
      expect(svgNodes().filter((n) => String(n.props.testID).startsWith('chart-marker'))).toHaveLength(7);
      expect(screen.queryByText('0,00', hidden)).toBeNull();
    });

    it('shows the empty state when no result has a time', async () => {
      await show(progressChartWithoutTime.filter((r) => r.time === null));

      expect(screen.getByText('Aún no hay tiempos para graficar')).toBeOnTheScreen();
    });

    it('leaves out a time that is not of the event, like a series total', async () => {
      await show(progressChartWithSeriesTotal);

      expect(maybeById('chart-marker-total')).toBeNull();
      expect(screen.getByText('38,00', hidden)).toBeOnTheScreen();
    });
  });

  describe('reserved projection zone', () => {
    it('is always there, with its text, and holds no line, goal or interval', async () => {
      await show(progressChartResults);

      expect(screen.getByText('Proyección pronto', hidden)).toBeOnTheScreen();
      const band = byId('chart-reserved');
      expect(paint(band, 'fill')).toBe(token('viz-reserved'));
      // A single rectangle: no second area (an interval) and no goal line.
      expect(svgNodes().filter((n) => n.type === 'RNSVGRect')).toHaveLength(1);
      const bandStart = band.props.x as number;
      for (const node of svgNodes().filter((n) => n.type === 'RNSVGLine')) {
        expect(node.props.x2 as number).toBeLessThan(bandStart);
      }
      // The series ends where the data ends: every point is a result, and none falls inside the band.
      const path = byId('chart-series').props.d as string;
      const points = path.replace(/^M/, '').split(' ').map(Number);
      expect(points).toHaveLength(progressChartResults.length * 2);
      for (let index = 0; index < points.length; index += 2) expect(points[index]).toBeLessThan(bandStart);
    });

    it('draws only the grid, the band, the personal best, the series and the points', async () => {
      await show(progressChartResults);

      const ids = svgNodes().map((n) => String(n.props.testID).split('-').slice(0, 2).join('-'));
      expect(new Set(ids)).toEqual(
        new Set(['chart-grid', 'chart-reserved', 'chart-best', 'chart-series', 'chart-marker', 'chart-point']),
      );
    });

    it('stays with a single result and with a range that has none', async () => {
      await show(progressChartOneResult);

      expect(screen.getByText('Proyección pronto', hidden)).toBeOnTheScreen();
    });
  });

  describe('tooltip', () => {
    it('shows the time, date, type and origin of the point that is pressed', async () => {
      await show(progressChartResults);
      expect(screen.queryByText('35,90', hidden)).toBeNull();

      await fireEvent.press(byId('chart-point-p3'));

      expect(screen.getByText('35,90')).toBeOnTheScreen();
      expect(screen.getByText('18 jul 2026 · Competencia · FEDNAT')).toBeOnTheScreen();
    });

    it.each([
      ['p1', '12 may 2026 · Entrenamiento · Registro propio'],
      ['p5', '12 sep 2026 · Competencia · Botón externo'],
    ])('says the origin of %s', async (id, text) => {
      await show(progressChartResults);

      await fireEvent.press(byId(`chart-point-${id}`));

      expect(screen.getByText(text)).toBeOnTheScreen();
    });

    it('closes when the same point is pressed again and moves to another point', async () => {
      await show(progressChartResults);

      await fireEvent.press(byId('chart-point-p3'));
      await fireEvent.press(byId('chart-point-p4'));
      expect(screen.queryByText('35,90')).toBeNull();
      expect(screen.getByText('35,60')).toBeOnTheScreen();

      await fireEvent.press(byId('chart-point-p4'));
      expect(screen.queryByText('35,60')).toBeNull();
    });
  });

  describe('range', () => {
    it('offers 3 m, 6 m, 1 año and Todo, with Todo chosen', async () => {
      await show(progressChartResults);

      for (const name of ['3 m', '6 m', '1 año', 'Todo']) expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Todo' })).toBeChecked();
    });

    it('keeps only the points inside the range', async () => {
      await show(progressChartResults);
      const drawn = () => svgNodes().filter((n) => String(n.props.testID).startsWith('chart-marker')).length;
      expect(drawn()).toBe(7);

      await fireEvent.press(screen.getByRole('radio', { name: '3 m' }));
      expect(drawn()).toBe(4);
      expect(maybeById('chart-marker-p3')).toBeNull();

      await fireEvent.press(screen.getByRole('radio', { name: '6 m' }));
      expect(drawn()).toBe(7);
    });

    it('drops the tooltip of a point that leaves the range', async () => {
      await show(progressChartResults);
      await fireEvent.press(byId('chart-point-p1'));
      expect(screen.getByText('12 may 2026 · Entrenamiento · Registro propio')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('radio', { name: '3 m' }));

      expect(screen.queryByText('12 may 2026 · Entrenamiento · Registro propio')).toBeNull();
    });

    it('says so when the range has no result and keeps the picker', async () => {
      await render(
        <ThemeProvider>
          <ProgressChart results={progressChartResults} today="2027-06-01" />
        </ThemeProvider>,
      );

      await fireEvent.press(screen.getByRole('radio', { name: '3 m' }));

      expect(screen.getByText('No hay resultados con tiempo en este rango. Prueba con uno más amplio.')).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Todo' })).toBeOnTheScreen();
    });
  });

  describe('text size', () => {
    const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text, hidden).props.style);

    it.each([1, 1.5, 2])('takes the caption size of the theme at text scale %s for every label', async (scale) => {
      await render(
        <ThemeProvider fontScale={scale}>
          <ProgressChart results={progressChartResults} today={progressChartToday} />
        </ThemeProvider>,
      );

      for (const text of ['34,00', 'may', 'oct', 'MP 34,82', 'Proyección pronto']) {
        expect(styleOf(text).fontSize).toBe(typography.caption.fontSize * scale);
        expect(styleOf(text).lineHeight).toBe(typography.caption.lineHeight * scale);
      }
    });

    it('writes the axis numbers in the mono face of the time tokens and the other labels in the strong sans face', async () => {
      await show(progressChartResults);

      expect(styleOf('34,00').fontFamily).toBe(typography['time-sm'].fontFamily);
      expect(styleOf('may').fontFamily).toBe(typography['time-sm'].fontFamily);
      expect(styleOf('MP 34,82').fontFamily).toBe(typography['body-strong'].fontFamily);
      expect(styleOf('Proyección pronto').fontFamily).toBe(typography['body-strong'].fontFamily);
    });

    it('makes room for larger text: a taller chart and a wider projection zone', async () => {
      await show(progressChartResults);
      const small = { band: byId('chart-reserved').props.width as number, label: styleOf('34,00').fontSize as number };
      await screen.unmount();

      await render(
        <ThemeProvider fontScale={2}>
          <ProgressChart results={progressChartResults} today={progressChartToday} />
        </ThemeProvider>,
      );

      expect(byId('chart-reserved').props.width as number).toBeGreaterThan(small.band);
      expect(styleOf('34,00').fontSize as number).toBe(small.label * 2);
    });

    it('has no font size, line height or font weight written in the component', () => {
      const source = fs.readFileSync(path.join(__dirname, '../components/ProgressChart/ProgressChart.tsx'), 'utf8');

      expect(source).not.toMatch(/fontSize\s*:\s*\d|lineHeight\s*:\s*\d|fontWeight\s*:\s*'/);
    });
  });

  describe('accessibility', () => {
    it('has one summary label with the first and the last time', async () => {
      await show(progressChartResults);

      expect(
        screen.getByLabelText('Progreso en Libre 50 m, más rápido hacia arriba: de 37,10 en mayo a 34,82 en octubre'),
      ).toBeOnTheScreen();
    });

    it('summarises the range that is shown', async () => {
      await show(progressChartResults);

      await fireEvent.press(screen.getByRole('radio', { name: '3 m' }));

      expect(
        screen.getByLabelText('Progreso en Libre 50 m, más rápido hacia arriba: de 35,60 en agosto a 34,82 en octubre'),
      ).toBeOnTheScreen();
    });

    it('summarises a single result', async () => {
      await show(progressChartOneResult);

      expect(
        screen.getByLabelText('Progreso en Libre 50 m, más rápido hacia arriba: 34,82 en octubre'),
      ).toBeOnTheScreen();
    });
  });
});
