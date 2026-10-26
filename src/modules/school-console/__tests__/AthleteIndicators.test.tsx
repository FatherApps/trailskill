import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { colors, contrastRatio as contrast, ThemeProvider, type ThemeName } from '../../../core/theme';
import { indicatorsFixture } from '../__fixtures__/athletes';
import { AthleteIndicators, athleteIndicatorsColors } from '../components/AthleteIndicators';

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const themes: ThemeName[] = ['light', 'dark'];

describe('AthleteIndicators', () => {
  it('shows the four indicators with their numbers, each read as one element', async () => {
    await render(<AthleteIndicators {...indicatorsFixture} />);

    for (const [label, value] of [
      ['Activos', '128'],
      ['Autorización pendiente', '7'],
      ['Mediciones esta semana', '342'],
      ['Por revisar', '2'],
    ]) {
      expect(screen.getByLabelText(`${label}: ${value}`)).toBeOnTheScreen();
      expect(screen.getByText(label, { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByText(value, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });

  it('draws each card on a white surface with the medium radius', async () => {
    await render(<AthleteIndicators {...indicatorsFixture} />);

    expect(StyleSheet.flatten(screen.getByLabelText('Activos: 128').props.style)).toMatchObject({
      backgroundColor: colors.light['surface-1'],
      borderRadius: 24,
    });
  });

  describe('columns by width', () => {
    const measure = (width: number) =>
      act(() => fireEvent(screen.getByTestId('athlete-indicators'), 'layout', { nativeEvent: { layout: { width, height: 100, x: 0, y: 0 } } }));
    const cardWidth = () => StyleSheet.flatten(screen.getByLabelText('Activos: 128').props.style).width as number;
    const perRow = (width: number) => Math.round((width + 12) / (cardWidth() + 12));

    it.each([
      [1000, 4],
      [636, 4],
      [635, 2],
      [312, 2],
      [311, 1],
      [200, 1],
    ])('at %s dp puts %s card(s) per row, all of equal width and never three', async (width, columns) => {
      await render(<AthleteIndicators {...indicatorsFixture} />);
      await measure(width);

      expect(perRow(width)).toBe(columns);
      for (const label of ['Autorización pendiente: 7', 'Mediciones esta semana: 342', 'Por revisar: 2']) {
        expect(StyleSheet.flatten(screen.getByLabelText(label).props.style).width).toBe(cardWidth());
      }
    });

    it('asks for twice the width per card at 200 % text', async () => {
      await render(<ThemeProvider fontScale={2}><AthleteIndicators {...indicatorsFixture} /></ThemeProvider>);

      await measure(1000);
      expect(perRow(1000)).toBe(2);
      await measure(599);
      expect(perRow(599)).toBe(1);
    });
  });

  it('wraps the cards instead of overflowing', async () => {
    await render(<AthleteIndicators {...indicatorsFixture} />);

    const row = screen.getByLabelText('Activos: 128').parent!;
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  });

  it.each(themes)('keeps the label and the number readable in the %s theme', (theme) => {
    const c = colors[theme];
    expect(athleteIndicatorsColors.card).toBe('surface-1');
    expect(contrast(c[athleteIndicatorsColors.label], c[athleteIndicatorsColors.card])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c[athleteIndicatorsColors.value], c[athleteIndicatorsColors.card])).toBeGreaterThanOrEqual(4.5);
  });

  it('follows the theme', async () => {
    await render(<ThemeProvider name="dark"><AthleteIndicators {...indicatorsFixture} /></ThemeProvider>);

    expect(StyleSheet.flatten(screen.getByLabelText('Activos: 128').props.style).backgroundColor).toBe(colors.dark['surface-1']);
  });
});

describe('AthleteIndicators with an unknown value', () => {
  it('says Sin dato, to the eye and to the screen reader, and never 0', async () => {
    await render(<AthleteIndicators {...indicatorsFixture} toReview={null} />);

    expect(screen.getByLabelText('Por revisar: Sin dato')).toBeOnTheScreen();
    expect(screen.getByText('Sin dato', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Por revisar: 0')).toBeNull();
    expect(screen.getByLabelText('Activos: 128')).toBeOnTheScreen();
  });

  it('still shows a real zero as 0', async () => {
    await render(<AthleteIndicators {...indicatorsFixture} toReview={0} />);

    expect(screen.getByLabelText('Por revisar: 0')).toBeOnTheScreen();
  });
});
