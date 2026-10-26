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
  it('lists the arrivals in order with their position and formatted time', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    const texts = screen.getAllByText(/./, hidden).map((node) => node.props.children);
    expect(texts).toEqual([1, '31,05', 'sin asignar', 2, '33,91', 'sin asignar', 3, '35,22', 'sin asignar', 4, '36,47', 'sin asignar']);
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
    expect(texts).toEqual([1, '40,00', 'sin asignar', 2, '30,00', 'sin asignar']);
  });

  it('says when each arrival happened on the wall clock', async () => {
    await render(<ArrivalList arrivals={[{ id: 'x', time: 3105, clockTime: '7:14:33' }]} />);

    expect(screen.getByText('7:14:33 · sin asignar', hidden)).toBeOnTheScreen();
  });

  it('draws each time in mono time-md with tabular digits', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    const style = StyleSheet.flatten(screen.getByText('31,05', hidden).props.style);
    expect(style?.fontSize).toBe(20);
    expect(style?.fontFamily).toBe('IBMPlexMono_600SemiBold');
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
    expect(screen.getByText('31,05', hidden).parent?.parent?.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('reads the sync state with the row and draws a pill only for what needs attention', async () => {
    await render(
      <ArrivalList
        arrivals={[
          { id: 'a', time: 3100, syncState: 'on_device' },
          { id: 'b', time: 3400, syncState: 'synced' },
          { id: 'c', time: 3500, syncState: 'not_sent' },
          { id: 'd', time: 3600, syncState: 'needs_review' },
        ]}
      />,
    );

    expect(screen.getByLabelText('Llegada 1, 31 segundos, En el teléfono')).toBeOnTheScreen();
    expect(screen.getByLabelText('Llegada 2, 34 segundos, Enviado')).toBeOnTheScreen();
    // Only the two pills outside the rows: "No enviado" and "Revisar".
    expect(screen.queryAllByTestId('sync-status')).toHaveLength(2);
  });

  it('draws the positions still to come as dashed waiting rows up to the swimmers in the water', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals.slice(0, 2)} total={5} />);

    expect(screen.getAllByText('Esperando llegada…', hidden)).toHaveLength(3);
    expect(screen.getByText('5', hidden)).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Llegada/)).toHaveLength(2);
  });

  it('draws no waiting row once every swimmer arrived', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} total={4} />);

    expect(screen.queryByText('Esperando llegada…', hidden)).toBeNull();
  });

  it('gives every row at least 48 dp, the surface-1 card look and the person_add hint', async () => {
    await render(<ArrivalList arrivals={seriesFixture.arrivals} />);

    for (const row of screen.getAllByLabelText(/^Llegada/)) {
      expect(StyleSheet.flatten(row.props.style)?.minHeight).toBeGreaterThanOrEqual(48);
      expect(StyleSheet.flatten(row.props.style)?.height).toBeUndefined();
    }
    const card = screen.getByText('31,05', hidden).parent?.parent?.parent?.parent;
    expect(StyleSheet.flatten(card?.props.style)?.backgroundColor).toBe(colors.light['surface-1']);
    expect(StyleSheet.flatten(card?.props.style)?.borderRadius).toBe(radius.md);
  });

  it('uses the dark theme tokens', async () => {
    await render(
      <ThemeProvider name="dark">
        <ArrivalList arrivals={seriesFixture.arrivals} />
      </ThemeProvider>,
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

  it('renders nothing for an empty list with nobody to wait for', async () => {
    await render(<ArrivalList arrivals={[]} />);

    expect(screen.queryByTestId('arrival-list')).toBeNull();
  });
});
