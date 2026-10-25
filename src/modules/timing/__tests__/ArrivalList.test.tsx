import { render, screen } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

import { colors, radius, ThemeProvider } from '../../../core/theme';
import { ArrivalList } from '../components/ArrivalList';
import { seriesFixture } from '../__fixtures__/series';

const hidden = { includeHiddenElements: true };

// Jest reports a system font scale of 2: pin 1 so the layout only depends on the theme scale under test.
beforeEach(() => jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1));
afterEach(() => jest.restoreAllMocks());

describe('ArrivalList', () => {
  it('lists the arrivals in order with their ordinal and formatted time', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    const texts = screen.getAllByText(/./, hidden).map((node) => node.props.children);
    expect(texts).toEqual(['1.º', '31,05', '2.º', '33,91', '3.º', '35,22', '4.º', '36,47']);
  });

  it('keeps the order it receives, even when a time is smaller than the previous one', async () => {
    await render(
      <ArrivalList
        arrivals={[
          { id: 'x', time: 4000 },
          { id: 'y', time: 3000 },
        ]}
      />,
    );

    const texts = screen.getAllByText(/./, hidden).map((node) => node.props.children);
    expect(texts).toEqual(['1.º', '40,00', '2.º', '30,00']);
  });

  it('draws each time in mono time-md with tabular digits', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    const style = StyleSheet.flatten(screen.getByText('31,05', hidden).props.style);
    expect(style?.fontSize).toBe(20);
    expect(style?.fontVariant).toEqual(['tabular-nums']);
    expect(style?.color).toBe(colors.light.ink);
  });

  it('makes each row one accessible element with a spoken label and no names', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    const rows = screen.getAllByLabelText(/^Llegada/);
    expect(rows).toHaveLength(4);
    expect(rows[0].props.accessibilityLabel).toBe('Llegada 1, 31 segundos con 5 centésimas');
    expect(rows[1].props.accessibilityLabel).toBe('Llegada 2, 33 segundos con 91 centésimas');
    expect(rows[0].props.accessible).toBe(true);
    expect(screen.getByText('1.º', hidden).parent?.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('gives every row at least 48 dp and the list the surface-1 card look', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    for (const row of screen.getAllByLabelText(/^Llegada/)) {
      expect(StyleSheet.flatten(row.props.style)?.minHeight).toBeGreaterThanOrEqual(48);
      expect(StyleSheet.flatten(row.props.style)?.height).toBeUndefined();
    }
    const list = screen.getByTestId('arrival-list');
    expect(StyleSheet.flatten(list.props.style)?.backgroundColor).toBe(colors.light['surface-1']);
    expect(StyleSheet.flatten(list.props.style)?.borderRadius).toBe(radius.md);
  });

  it('uses the dark theme tokens', async () => {
    await render(
      <ThemeProvider name="dark">
        <ArrivalList arrivals={seriesFixture.arrivals} />
      </ThemeProvider>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('arrival-list').props.style)?.backgroundColor).toBe(
      colors.dark['surface-1'],
    );
    expect(StyleSheet.flatten(screen.getByText('31,05', hidden).props.style)?.color).toBe(colors.dark.ink);
  });

  it('renders every row of a long list and keeps font scaling on', async () => {
    await render(<ArrivalList arrivals={seriesFixture.manyArrivals} />);

    expect(screen.getAllByLabelText(/^Llegada/)).toHaveLength(8);
    for (const text of screen.getAllByText(/./, hidden)) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  it('renders nothing for an empty list', async () => {
    await render(<ArrivalList arrivals={[]} />);

    expect(screen.queryByTestId('arrival-list')).toBeNull();
  });
});
