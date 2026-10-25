import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, typography, type ThemeName } from '../../theme';
import { formatTime } from '../../time';
import { TimeValue } from '../TimeValue';

const themes: ThemeName[] = ['light', 'dark'];
const sizes = ['time-lg', 'time-md', 'time-sm'] as const;

const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

describe('TimeValue', () => {
  it('shows the result of formatTime', async () => {
    await render(<TimeValue value={3482} />);

    expect(screen.getByText(formatTime(3482))).toBeOnTheScreen();
    expect(screen.getByText('34,82')).toBeOnTheScreen();
  });

  it('shows a minute time as formatTime does', async () => {
    await render(<TimeValue value={7240} />);

    expect(screen.getByText(formatTime(7240))).toBeOnTheScreen();
  });

  it('shows — for a missing time and never 0,00', async () => {
    await render(<TimeValue value={null} />);

    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(screen.queryByText('0,00')).toBeNull();
    expect(screen.queryByText(/0[,.]00/)).toBeNull();
  });

  it('passes the decimal separator to formatTime and defines none of its own', async () => {
    await render(<TimeValue value={3482} decimalSeparator="." />);

    expect(screen.getByText(formatTime(3482, { decimalSeparator: '.' }))).toBeOnTheScreen();
    expect(screen.getByText('34.82')).toBeOnTheScreen();
  });

  it.each(sizes)('%s uses its typography token and tabular numbers', async (size) => {
    await render(<TimeValue value={3482} size={size} />);

    expect(styleOf('34,82')).toMatchObject({ ...typography[size], fontVariant: ['tabular-nums'] });
  });

  it('defaults to time-md', async () => {
    await render(<TimeValue value={3482} />);

    expect(styleOf('34,82')).toMatchObject(typography['time-md']);
  });

  it('keeps tabular numbers for a missing time', async () => {
    await render(<TimeValue value={null} />);

    expect(styleOf('—').fontVariant).toEqual(['tabular-nums']);
  });

  it('is ink for a time and ink-muted for a missing one', async () => {
    await render(
      <>
        <TimeValue value={3482} />
        <TimeValue value={null} />
      </>,
    );

    expect(styleOf('34,82').color).toBe(colors.light.ink);
    expect(styleOf('—').color).toBe(colors.light['ink-muted']);
  });

  it('follows the theme', async () => {
    await render(
      <ThemeProvider name="dark">
        <TimeValue value={3482} />
      </ThemeProvider>,
    );

    expect(styleOf('34,82').color).toBe(colors.dark.ink);
  });

  it('does not clip text', async () => {
    await render(<TimeValue value={3482} />);

    const text = screen.getByText('34,82');
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(styleOf('34,82').width).toBeUndefined();
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each([
      ['ink', 'surface-0'],
      ['ink', 'surface-1'],
      ['ink-muted', 'surface-0'],
      ['ink-muted', 'surface-1'],
    ] as const)('%s on %s is at least 4.5:1', (text, surface) => {
      expect(contrastRatio(c[text], c[surface])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
