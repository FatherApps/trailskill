import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

import { colors, contrastRatio, radius, ThemeProvider, type ThemeName } from '../../../core/theme';
import { NameCard } from '../components/NameCard';
import { seriesFixture } from '../__fixtures__/series';

const hidden = { includeHiddenElements: true };
const themes: ThemeName[] = ['light', 'dark'];
const athleteColors = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'] as const;

beforeEach(() => jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1));
afterEach(() => jest.restoreAllMocks());

describe('NameCard', () => {
  it('is a button named after the athlete that fires onPress', async () => {
    const onPress = jest.fn();
    await render(<NameCard name="Mateo C." color="athlete-1" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Asignar a Mateo C.' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Mateo C.')).toBeOnTheScreen();
    expect(screen.queryByText(/\.º/)).toBeNull();
  });

  it('shows and announces its position once assigned', async () => {
    await render(<NameCard name="Lucía R." color="athlete-2" position={2} onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Lucía R., en la posición 2' })).toBeOnTheScreen();
    expect(screen.getByText('2.º', hidden)).toBeOnTheScreen();
  });

  it('treats a null position as not assigned', async () => {
    await render(<NameCard name="Sara P." color="athlete-3" position={null} onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Asignar a Sara P.' })).toBeOnTheScreen();
  });

  it('is at least 72 dp tall, rounded md, never fixed in size', async () => {
    await render(<NameCard name="Tomás V." color="athlete-4" onPress={jest.fn()} />);

    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style?.minHeight).toBeGreaterThanOrEqual(72);
    expect(style?.borderRadius).toBe(radius.md);
    expect(style?.height).toBeUndefined();
    expect(style?.width).toBeUndefined();
  });

  it('keeps font scaling on and never truncates the name', async () => {
    await render(<NameCard name="Mateo C." color="athlete-1" position={1} onPress={jest.fn()} />);

    for (const text of screen.getAllByText(/./, hidden)) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  describe.each(themes)('in the %s theme', (theme) => {
    it.each(athleteColors)('%s only uses its own colour and on-color', async (color) => {
      await render(
        <ThemeProvider name={theme}>
          <NameCard name="Mateo C." color={color} position={1} onPress={jest.fn()} />
        </ThemeProvider>,
      );

      const button = StyleSheet.flatten(screen.getByRole('button').props.style);
      expect(button?.backgroundColor).toBe(colors[theme][color]);
      const used = screen.getAllByText(/./, hidden).map((text) => StyleSheet.flatten(text.props.style)?.color);
      expect(used.length).toBeGreaterThan(0);
      for (const textColor of used) expect(textColor).toBe(colors[theme]['on-color']);
    });

    it.each(athleteColors)('%s text has a contrast of at least 4.5', (color) => {
      expect(contrastRatio(colors[theme]['on-color'], colors[theme][color])).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('lets the fixture athletes cover the four colours', () => {
    expect(seriesFixture.athletes.map((athlete) => athlete.color)).toEqual(athleteColors);
  });
});
