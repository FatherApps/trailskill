import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, radius, ThemeProvider, type ThemeName } from '../../theme';
import { ColorCard, colorCardColors, type ColorCardColor } from '../ColorCard';

const themes: ThemeName[] = ['light', 'dark'];
const fills: ColorCardColor[] = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4', 'lime', 'coral', 'lilac', 'sky'];

const rootStyle = () => StyleSheet.flatten((screen.toJSON() as unknown as { props: { style: unknown } }).props.style as object) as {
  backgroundColor: string;
  borderRadius: number;
};

describe('ColorCard', () => {
  it.each(fills)('fills the card with the %s token and rounds it with radius.md', async (color) => {
    await render(
      <ThemeProvider>
        <ColorCard color={color} title="Tomás R." />
      </ThemeProvider>,
    );

    expect(rootStyle()).toMatchObject({ backgroundColor: colors.light[color], borderRadius: radius.md });
  });

  it('shows the title, the detail and its children', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="athlete-2" title="Tomás R." detail="Infantil A">
          <ColorCard color="athlete-3" title="Dentro" />
        </ColorCard>
      </ThemeProvider>,
    );

    for (const text of ['Tomás R.', 'Infantil A', 'Dentro']) expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it('prints its text in on-color', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="athlete-1" title="Lucía R." detail="Infantil B" />
      </ThemeProvider>,
    );

    for (const text of ['Lucía R.', 'Infantil B']) {
      expect(StyleSheet.flatten(screen.getByText(text).props.style).color).toBe(colors.light[colorCardColors.text]);
    }
  });

  it.each(themes.flatMap((theme) => fills.map((color) => [theme, color] as const)))(
    'keeps the text readable on the %s fill in the %s theme',
    (theme, color) => {
      expect(contrastRatio(colors[theme][colorCardColors.text], colors[theme][color])).toBeGreaterThanOrEqual(4.5);
    },
  );
});
