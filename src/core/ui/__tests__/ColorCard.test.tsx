import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, radius, space, ThemeProvider, type ThemeName } from '../../theme';
import { ColorCard, colorCardColors, type ColorCardColor } from '../ColorCard';

// The test renderer drops '' before it reaches the tree; React Native's renderer throws on it. Record what each View is given instead.
const mockStrayStrings: string[] = [];
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const RecordingView = (props: { children?: unknown }) => {
    const children = Array.isArray(props.children) ? props.children : [props.children];
    for (const child of children) if (typeof child === 'string') mockStrayStrings.push(child);
    return React.createElement(actual.View, props);
  };
  return new Proxy(actual, { get: (target, key) => (key === 'View' ? RecordingView : target[key]) });
});

beforeEach(() => {
  mockStrayStrings.length = 0;
});

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

  it('draws nothing besides the title when the detail is an empty string', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="athlete-1" title="Lucía R." detail="" />
      </ThemeProvider>,
    );

    expect(mockStrayStrings).toEqual([]);
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

  it('renders exactly as before when it has no decoration', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="lime" title="Tomás R." detail="Infantil A" />
      </ThemeProvider>,
    );

    expect(rootStyle()).toEqual({ gap: space[1], padding: space[4], borderRadius: radius.md, backgroundColor: colors.light.lime });
    expect(screen.toJSON()).toMatchObject({ children: [expect.objectContaining({ type: 'Text' }), expect.objectContaining({ type: 'Text' })] });
    expect(screen.queryByTestId('color-card-ring')).not.toBeOnTheScreen();
  });

  it('draws a ring, a dot and an accent dot from tokens behind the text, clipped to the card', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="lime" title="Cada entreno suma." decoration={{ dot: 'coral', accent: 'lilac' }} />
      </ThemeProvider>,
    );

    expect(rootStyle()).toMatchObject({ backgroundColor: colors.light.lime, overflow: 'hidden' });
    expect(StyleSheet.flatten(screen.getByTestId('color-card-ring', { includeHiddenElements: true }).props.style)).toMatchObject({
      borderColor: colors.light['card-ring'],
    });
    expect(StyleSheet.flatten(screen.getByTestId('color-card-dot', { includeHiddenElements: true }).props.style).backgroundColor).toBe(colors.light.coral);
    expect(StyleSheet.flatten(screen.getByTestId('color-card-accent', { includeHiddenElements: true }).props.style).backgroundColor).toBe(colors.light.lilac);
    expect(screen.getByText('Cada entreno suma.')).toBeOnTheScreen();
  });

  it('leaves the accent dot out when none is given', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="lilac" title="Hola de nuevo" decoration={{ dot: 'lime' }} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('color-card-dot', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('color-card-accent', { includeHiddenElements: true })).toBeNull();
  });

  it('hides the decoration from screen readers and touches', async () => {
    await render(
      <ThemeProvider>
        <ColorCard color="lime" title="Hola" decoration={{ dot: 'coral' }} />
      </ThemeProvider>,
    );

    const decoration = screen.getByTestId('color-card-decoration', { includeHiddenElements: true });
    expect(decoration.props).toMatchObject({ accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true, pointerEvents: 'none' });
  });

  it.each(themes)('has a translucent ring token in the %s theme', (theme) => {
    expect(colors[theme]['card-ring']).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
  });
});
