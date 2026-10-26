import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, radius, size, ThemeProvider, type ThemeName } from '../../theme';
import { unavailableColors } from '../Button';
import { Chip, chipColors, InitialsDot } from '../Chip';

const themes: ThemeName[] = ['light', 'dark'];
const dot = { initials: 'LR', color: 'athlete-1' } as const;

describe('Chip', () => {
  it('is a radio named by its label, selected or not', async () => {
    await render(
      <ThemeProvider>
        <Chip label="Lucía" selected onPress={jest.fn()} />
        <Chip label="Tomás" onPress={jest.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('radio', { name: 'Lucía' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Lucía' }).props.accessibilityState).toMatchObject({ checked: true, selected: true });
    expect(screen.getByRole('radio', { name: 'Tomás' }).props.accessibilityState).toMatchObject({ checked: false, selected: false });
  });

  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <Chip label="Lucía" onPress={onPress} />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByRole('radio', { name: 'Lucía' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a pill with the minimum touch target, white at rest and black when selected', async () => {
    await render(
      <ThemeProvider>
        <Chip label="Lucía" selected onPress={jest.fn()} />
        <Chip label="Tomás" onPress={jest.fn()} />
      </ThemeProvider>,
    );

    const on = StyleSheet.flatten(screen.getByRole('radio', { name: 'Lucía' }).props.style);
    const off = StyleSheet.flatten(screen.getByRole('radio', { name: 'Tomás' }).props.style);
    expect(on).toMatchObject({ backgroundColor: colors.light[chipColors.selected.background], borderRadius: radius.full });
    expect(off).toMatchObject({ backgroundColor: colors.light[chipColors.background], borderRadius: radius.full });
    expect(on.minHeight).toBeGreaterThanOrEqual(size['target-min']);
    expect(on.width).toBeUndefined();
    expect(on.height).toBeUndefined();
  });

  it('prints the label in on-primary when selected', async () => {
    await render(
      <ThemeProvider>
        <Chip label="Lucía" selected onPress={jest.fn()} />
      </ThemeProvider>,
    );

    expect(StyleSheet.flatten(screen.getByText('Lucía', { includeHiddenElements: true }).props.style).color).toBe(colors.light[chipColors.selected.text]);
  });

  describe('disabled', () => {
    it('does not call onPress and says so to screen readers, keeping checked and selected', async () => {
      const onPress = jest.fn();
      await render(
        <ThemeProvider>
          <Chip label="Lucía" selected disabled onPress={onPress} />
          <Chip label="Tomás" disabled onPress={onPress} />
        </ThemeProvider>,
      );

      await fireEvent.press(screen.getByRole('radio', { name: 'Tomás' }));

      expect(onPress).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Lucía' }).props.accessibilityState).toEqual({ checked: true, selected: true, disabled: true });
      expect(screen.getByRole('radio', { name: 'Tomás' }).props.accessibilityState).toEqual({ checked: false, selected: false, disabled: true });
    });

    it('is enabled by default', async () => {
      await render(
        <ThemeProvider>
          <Chip label="Lucía" onPress={jest.fn()} />
        </ThemeProvider>,
      );

      expect(screen.getByRole('radio', { name: 'Lucía' })).toBeEnabled();
    });

    it('turns the unchosen chip into the unavailable grey of Button, with no border', async () => {
      await render(
        <ThemeProvider>
          <Chip label="Tomás" disabled onPress={jest.fn()} />
        </ThemeProvider>,
      );

      const style = StyleSheet.flatten(screen.getByRole('radio', { name: 'Tomás' }).props.style);
      expect(style).toMatchObject({ backgroundColor: colors.light[unavailableColors.background], borderColor: 'transparent' });
      expect(StyleSheet.flatten(screen.getByText('Tomás', { includeHiddenElements: true }).props.style).color).toBe(colors.light[unavailableColors.text]);
    });

    it('keeps the black of a chosen chip', async () => {
      await render(
        <ThemeProvider>
          <Chip label="Lucía" selected disabled onPress={jest.fn()} />
        </ThemeProvider>,
      );

      const style = StyleSheet.flatten(screen.getByRole('radio', { name: 'Lucía' }).props.style);
      expect(style).toMatchObject({ backgroundColor: colors.light[chipColors.selected.background], borderColor: colors.light[chipColors.selected.border] });
      expect(StyleSheet.flatten(screen.getByText('Lucía', { includeHiddenElements: true }).props.style).color).toBe(colors.light[chipColors.selected.text]);
    });

    it.each(themes)('keeps the unchosen label readable in the %s theme', (theme) => {
      expect(contrastRatio(colors[theme][unavailableColors.text], colors[theme][unavailableColors.background])).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('shows the swimmer dot with the initials but reads only the label', async () => {
    await render(
      <ThemeProvider>
        <Chip label="Lucía" dot={dot} onPress={jest.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByText('LR', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Lucía' })).toBeOnTheScreen();
  });

  it('shows a focus ring while it has the keyboard focus', async () => {
    await render(
      <ThemeProvider>
        <Chip label="Lucía" onPress={jest.fn()} />
      </ThemeProvider>,
    );

    await fireEvent(screen.getByRole('radio', { name: 'Lucía' }), 'focus');

    expect(StyleSheet.flatten(screen.getByRole('radio', { name: 'Lucía' }).props.style)).toMatchObject({
      outlineColor: colors.light.focus,
      outlineWidth: 2,
    });
  });

  it.each(themes)('keeps the label readable at rest and selected in the %s theme', (theme) => {
    expect(contrastRatio(colors[theme][chipColors.text], colors[theme][chipColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors[theme][chipColors.selected.text], colors[theme][chipColors.selected.background])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('InitialsDot', () => {
  it('is a circle in the athlete colour with the initials in on-color', async () => {
    await render(
      <ThemeProvider>
        <InitialsDot initials="TR" color="athlete-2" />
      </ThemeProvider>,
    );

    const initials = screen.getByText('TR');
    expect(StyleSheet.flatten(initials.props.style).color).toBe(colors.light[chipColors.dotText]);
    expect(StyleSheet.flatten(initials.parent!.props.style)).toMatchObject({
      backgroundColor: colors.light['athlete-2'],
      borderRadius: radius.full,
    });
  });

  it.each(themes.flatMap((theme) => (['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'] as const).map((color) => [theme, color] as const)))(
    'keeps the initials readable on the %s dot in the %s theme',
    (theme, color) => {
      expect(contrastRatio(colors[theme][chipColors.dotText], colors[theme][color])).toBeGreaterThanOrEqual(4.5);
    },
  );
});
