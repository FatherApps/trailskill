import { render, screen } from '@testing-library/react-native';
import { processColor, StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, typography, type ThemeName } from '../../theme';
import { formatTime } from '../../time';
import { iconPaths } from '../icons';
import { TimeValue } from '../TimeValue';

const themes: ThemeName[] = ['light', 'dark'];
const sizes = ['time-lg', 'time-md', 'time-sm'] as const;

const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);
// The time, delta and tags of the row are hidden from screen readers: the row carries the spoken label.
const hiddenStyleOf = (text: string) =>
  StyleSheet.flatten(screen.getByText(text, { includeHiddenElements: true }).props.style);
const pathsOf = () => screen.container.queryAll((node) => node.type === 'RNSVGPath');
const fillOf = (token: keyof (typeof colors)['light']) => ({ type: 0, payload: processColor(colors.light[token]) });

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

  describe('completed, no time', () => {
    it('shows Completado with the check icon and never 0,00 or —', async () => {
      await render(<TimeValue value={null} completed />);

      expect(screen.getByText('Completado', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.queryByText('—', { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByText(/0[,.]00/, { includeHiddenElements: true })).toBeNull();
      expect(pathsOf().map((path) => path.props.d)).toEqual([iconPaths.check]);
    });

    it('still shows — for a missing time that is not completed', async () => {
      await render(<TimeValue value={null} completed={false} />);

      expect(screen.getByText('—')).toBeOnTheScreen();
      expect(screen.queryByText('Completado', { includeHiddenElements: true })).toBeNull();
    });

    it('ignores completed when there is a time', async () => {
      await render(<TimeValue value={3482} completed />);

      expect(screen.getByText('34,82')).toBeOnTheScreen();
      expect(screen.queryByText('Completado', { includeHiddenElements: true })).toBeNull();
    });
  });

  describe('difference against the personal best', () => {
    it('faster: success, up arrow, minus sign and the difference', async () => {
      await render(<TimeValue value={3482} personalBest={3573} />);

      expect(hiddenStyleOf('−0,91 vs MP').color).toBe(colors.light.success);
      expect(hiddenStyleOf('−0,91 vs MP')).toMatchObject({ fontVariant: ['tabular-nums'], fontWeight: '600' });
      expect(pathsOf().map((path) => path.props.d)).toEqual([iconPaths.arrow_upward]);
      expect(pathsOf()[0].props.fill).toEqual(fillOf('success'));
    });

    it('slower: ink-muted, down arrow, plus sign, and never danger', async () => {
      await render(<TimeValue value={7240} personalBest={7135} />);

      expect(hiddenStyleOf('+1,05 vs MP').color).toBe(colors.light['ink-muted']);
      expect(pathsOf().map((path) => path.props.d)).toEqual([iconPaths.arrow_downward]);
      expect(pathsOf()[0].props.fill).toEqual(fillOf('ink-muted'));
      expect(pathsOf()[0].props.fill).not.toEqual(fillOf('danger-text'));
      expect(hiddenStyleOf('+1,05 vs MP').color).not.toBe(colors.light['danger-text']);
    });

    it('uses the decimal separator of the time', async () => {
      await render(<TimeValue value={3482} personalBest={3573} decimalSeparator="." />);

      expect(screen.getByText('−0.91 vs MP', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it.each([
      ['equal to the personal best', 3482, 3482],
      ['without a personal best', 3482, null],
      ['with a missing time', null, 3482],
    ])('shows no difference %s', async (_name, value, personalBest) => {
      await render(<TimeValue value={value} personalBest={personalBest} />);

      expect(screen.queryByText(/vs MP/, { includeHiddenElements: true })).toBeNull();
      expect(pathsOf()).toHaveLength(0);
    });
  });

  describe('MP tag', () => {
    it('shows the MP tag after the time for a new personal best', async () => {
      await render(<TimeValue value={3482} newPersonalBest />);

      expect(screen.getByText('34,82', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByText('MP', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(hiddenStyleOf('MP').color).toBe(colors.light.success);
    });

    it('does not show the tag by default or without a time', async () => {
      await render(
        <>
          <TimeValue value={3482} />
          <TimeValue value={null} newPersonalBest />
        </>,
      );

      expect(screen.queryByText('MP', { includeHiddenElements: true })).toBeNull();
    });
  });

  describe('spoken label', () => {
    it('is the spoken time for a time', async () => {
      await render(<TimeValue value={7240} />);

      expect(screen.getByLabelText('1 minuto, 12 segundos con 40 centésimas')).toBeOnTheScreen();
    });

    it('says Sin registro for a missing time', async () => {
      await render(<TimeValue value={null} />);

      expect(screen.getByLabelText('Sin registro')).toBeOnTheScreen();
    });

    it('says Completado, sin tiempo for a completed result', async () => {
      await render(<TimeValue value={null} completed />);

      expect(screen.getByLabelText('Completado, sin tiempo')).toBeOnTheScreen();
    });

    it('adds the faster difference and the personal best', async () => {
      await render(<TimeValue value={3482} personalBest={3573} newPersonalBest />);

      expect(
        screen.getByLabelText(
          '34 segundos con 82 centésimas. 91 centésimas menos que la marca personal. Marca personal',
        ),
      ).toBeOnTheScreen();
    });

    it('adds the slower difference', async () => {
      await render(<TimeValue value={7240} personalBest={7135} />);

      expect(
        screen.getByLabelText(
          '1 minuto, 12 segundos con 40 centésimas. 1 segundo con 5 centésimas más que la marca personal',
        ),
      ).toBeOnTheScreen();
    });

    it('adds only the personal best tag', async () => {
      await render(<TimeValue value={3482} newPersonalBest />);

      expect(screen.getByLabelText('34 segundos con 82 centésimas. Marca personal')).toBeOnTheScreen();
    });

    it('is one accessible element whose children are hidden from screen readers', async () => {
      await render(<TimeValue value={3482} personalBest={3573} newPersonalBest />);

      const row = screen.getByLabelText(/34 segundos/);
      expect(row.props.accessible).toBe(true);
      expect(screen.queryByText('34,82')).toBeNull();
      expect(screen.queryByText('MP')).toBeNull();
      expect(screen.queryByText('−0,91 vs MP')).toBeNull();
    });

    it('keeps font scaling on and no line limit in the row', async () => {
      await render(<TimeValue value={3482} personalBest={3573} newPersonalBest />);

      for (const text of screen.container.queryAll((node) => node.type === 'Text')) {
        expect(text.props.allowFontScaling).not.toBe(false);
        expect(text.props.numberOfLines).toBeUndefined();
      }
    });
  });

  describe.each(themes)('%s theme extras contrast', (theme) => {
    const c = colors[theme];

    it.each([
      ['success', 'surface-0'],
      ['success', 'surface-1'],
      ['success', 'success-bg'],
    ] as const)('%s on %s is at least 4.5:1', (text, surface) => {
      expect(contrastRatio(c[text], c[surface])).toBeGreaterThanOrEqual(4.5);
    });
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
