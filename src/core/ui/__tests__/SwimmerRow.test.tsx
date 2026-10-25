import { fireEvent, render, screen } from '@testing-library/react-native';
import { processColor, StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../theme';
import { iconPaths } from '../icons';
import { SwimmerRow, swimmerRowColors, type SwimmerRowProps } from '../SwimmerRow';

const themes: ThemeName[] = ['light', 'dark'];
const athleteColors = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'] as const;

const base: SwimmerRowProps = {
  name: 'Lucía R.',
  initials: 'LR',
  color: 'athlete-1',
  detail: 'Infantil B',
  bestTime: 3482,
  bestTimeLabel: 'MP 50 L',
};

const rowStyle = (row: { props: { style?: unknown } }) => StyleSheet.flatten(row.props.style as never);
const hiddenTexts = () => screen.queryAllByText(/./, { includeHiddenElements: true });

describe('SwimmerRow time', () => {
  const timed = { name: 'Lucía R.', initials: 'LR', color: 'athlete-1', detail: 'Infantil B' } as const;

  it('draws the time on the right and announces it with its spoken prefix', async () => {
    await render(<SwimmerRow {...timed} time={3391} timeLabel="Tiempo" />);

    expect(screen.getByLabelText('Lucía R., Infantil B, Tiempo 33,91')).toBeOnTheScreen();
    expect(screen.getByText('33,91', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('announces the time alone when there is no prefix', async () => {
    await render(<SwimmerRow {...timed} time={3391} />);

    expect(screen.getByLabelText('Lucía R., Infantil B, 33,91')).toBeOnTheScreen();
  });

  it('shows a missing time as a dash and says it is missing, never 0,00', async () => {
    await render(<SwimmerRow {...timed} time={null} timeLabel="Tiempo" />);

    expect(screen.getByLabelText('Lucía R., Infantil B, Tiempo sin registrar')).toBeOnTheScreen();
    expect(screen.getByText('—', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText(/0,00/, { includeHiddenElements: true })).toBeNull();
  });

  it('keeps announcing a best time as marca personal when no time is given', async () => {
    await render(<SwimmerRow {...timed} bestTime={3482} timeLabel="Tiempo" />);

    expect(screen.getByLabelText('Lucía R., Infantil B, marca personal 34,82')).toBeOnTheScreen();
  });

  it('lets the time win when both are given', async () => {
    await render(<SwimmerRow {...timed} bestTime={3482} bestTimeLabel="MP 50 L" time={3391} timeLabel="Tiempo" />);

    expect(screen.getByLabelText('Lucía R., Infantil B, Tiempo 33,91')).toBeOnTheScreen();
    expect(screen.queryByText('34,82', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('MP 50 L', { includeHiddenElements: true })).toBeNull();
  });
});

describe('SwimmerRow', () => {
  it('is one accessible element with a composed label', async () => {
    await render(<SwimmerRow {...base} onPress={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Lucía R., Infantil B, marca personal 34,82, MP 50 L' }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // Everything inside is hidden from screen readers: the row label already says it.
    expect(screen.queryAllByText(/./)).toHaveLength(0);
    expect(hiddenTexts().length).toBeGreaterThan(0);
  });

  it('is one accessible element without onPress too', async () => {
    await render(<SwimmerRow {...base} />);

    expect(screen.getByLabelText('Lucía R., Infantil B, marca personal 34,82, MP 50 L')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryAllByText(/./)).toHaveLength(0);
  });

  it('says sin marca personal when the best time is missing', async () => {
    await render(<SwimmerRow {...base} bestTime={null} onPress={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Lucía R., Infantil B, sin marca personal, MP 50 L' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('—', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('0,00', { includeHiddenElements: true })).toBeNull();
  });

  it('renders without throwing and adds nothing to the label when the caption is empty', async () => {
    await render(<SwimmerRow {...base} bestTimeLabel="" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Lucía R., Infantil B, marca personal 34,82' })).toBeOnTheScreen();
  });

  it('says nothing about a best time when none is given', async () => {
    await render(<SwimmerRow name="Sara P." initials="SP" color="athlete-3" detail="Juvenil A" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Sara P., Juvenil A' })).toBeOnTheScreen();
  });

  it('adds the tag label to the accessible label and shows the tag', async () => {
    await render(
      <SwimmerRow {...base} tag={{ label: 'Consentimiento', variant: 'warn', icon: 'schedule' }} onPress={jest.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Lucía R., Infantil B, marca personal 34,82, MP 50 L, Consentimiento' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Consentimiento', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('shows the best time with its caption', async () => {
    await render(<SwimmerRow {...base} />);

    expect(screen.getByText('34,82', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('MP 50 L', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('draws the chevron only when asked', async () => {
    const paths = () => screen.container.queryAll((node) => node.type === 'RNSVGPath').map((path) => path.props.d);

    await render(<SwimmerRow {...base} chevron />);
    expect(paths()).toEqual([iconPaths.chevron_right]);

    await render(<SwimmerRow {...base} />);
    expect(paths()).toEqual([]);
  });

  it('calls onPress and announces the selected state', async () => {
    const onPress = jest.fn();
    await render(<SwimmerRow {...base} selected onPress={onPress} />);

    const row = screen.getByRole('button');
    expect(row).toBeSelected();
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces the selected state without onPress too', async () => {
    await render(<SwimmerRow {...base} selected />);

    expect(screen.getByLabelText(/Lucía R\./)).toBeSelected();
  });

  it('is not selected by default', async () => {
    await render(<SwimmerRow {...base} onPress={jest.fn()} />);

    expect(screen.getByRole('button')).not.toBeSelected();
  });

  it('is a touch target of at least 64 with no fixed width, on surface-1 or primary-tint when selected', async () => {
    await render(<SwimmerRow {...base} onPress={jest.fn()} />);
    const style = rowStyle(screen.getByRole('button'));
    expect(style.minHeight).toBeGreaterThanOrEqual(64);
    expect(style.width).toBeUndefined();
    expect(style.height).toBeUndefined();
    expect(style.backgroundColor).toBe(colors.light['surface-1']);

    await render(<SwimmerRow {...base} selected onPress={jest.fn()} />);
    expect(rowStyle(screen.getByRole('button')).backgroundColor).toBe(colors.light['primary-tint']);
  });

  it('wraps long text instead of clipping it', async () => {
    await render(
      <SwimmerRow
        {...base}
        name="Un nombre de nadador especialmente largo"
        detail="Un grupo con un nombre largo · 12 tiempos registrados este mes"
        tag={{ label: 'Consentimiento pendiente', variant: 'warn' }}
        chevron
      />,
    );

    const texts = hiddenTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const text of screen.container.queryAll((node) => node.type === 'Text')) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.allowFontScaling).not.toBe(false);
    }
  });

  it.each(athleteColors)('draws the initials on an avatar in %s with on-color text', async (color) => {
    await render(<SwimmerRow {...base} color={color} />);

    const initials = screen.getByText('LR', { includeHiddenElements: true });
    expect(StyleSheet.flatten(initials.props.style).color).toBe(colors.light['on-color']);
    const avatar = screen.container.queryAll(
      (node) => rowStyle(node)?.backgroundColor === colors.light[color] && rowStyle(node)?.borderRadius === 999,
    );
    expect(avatar.length).toBeGreaterThan(0);
    expect(processColor(rowStyle(avatar[0]).backgroundColor as string)).toBe(processColor(colors.light[color]));
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each([
      [swimmerRowColors.name, swimmerRowColors.background],
      [swimmerRowColors.name, swimmerRowColors.selectedBackground],
      [swimmerRowColors.detail, swimmerRowColors.background],
      [swimmerRowColors.detail, swimmerRowColors.selectedBackground],
    ] as const)('%s on %s is at least 4.5:1', (text, background) => {
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(athleteColors)('on-color on %s is at least 4.5:1', (color) => {
      expect(contrastRatio(c[swimmerRowColors.initials], c[color])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
