import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio as contrast, ThemeProvider, type ThemeName } from '../../../core/theme';
import { indicatorsFixture } from '../__fixtures__/athletes';
import { AthleteIndicators, athleteIndicatorsColors } from '../components/AthleteIndicators';

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
