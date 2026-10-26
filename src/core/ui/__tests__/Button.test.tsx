import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, useColorScheme } from 'react-native';

import { colors, contrastRatio, darken, size, type ThemeName } from '../../theme';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Button, buttonColors, onClockStopColors, unavailableColors, type ButtonVariant } from '../Button';
import { iconPaths } from '../icons';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ default: jest.fn() }));

const themes: ThemeName[] = ['light', 'dark'];
const variants = Object.keys(buttonColors) as ButtonVariant[];

describe('Button', () => {
  it('exposes role, label and state, and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Guardar tiempo" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Guardar tiempo' });
    expect(button).toBeEnabled();
    expect(button).not.toBeBusy();

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the label alone and passes the hint through on an available button', async () => {
    const onPress = jest.fn();
    await render(<Button label="Guardar tiempo" accessibilityHint="Guarda 0:33,91 para Mateo C." onPress={onPress} />);

    const button = screen.getByRole('button', { name: /^Guardar tiempo$/ });
    expect(button).toBeEnabled();
    expect(button.props.accessibilityHint).toBe('Guarda 0:33,91 para Mateo C.');
    expect(screen.getByText(/^Guardar tiempo$/)).toBeOnTheScreen();

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is busy while loading, shows the gerund label, and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Guardar tiempo" loadingLabel="Guardando" loading onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Guardar tiempo' });
    expect(button).toBeBusy();
    expect(screen.getByText('Guardando')).toBeOnTheScreen();

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('never disables silently: shows the reason and announces it', async () => {
    const onPress = jest.fn();
    await render(<Button label="Autorizar" disabledReason="Solo el acudiente puede autorizar" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Autorizar · Solo el acudiente puede autorizar' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Autorizar · Solo el acudiente puede autorizar')).toBeOnTheScreen();

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  describe('ghost underline', () => {
    const ghost = () => (
      <ThemeProvider>
        <Button label="Volver" variant="ghost" onPress={jest.fn()} />
      </ThemeProvider>
    );
    const label = () => screen.getByText('Volver');
    const style = () => StyleSheet.flatten(label().props.style);

    it.each(themes)('is underlined in the %s theme', async (theme) => {
      jest.mocked(useColorScheme).mockReturnValue(theme);
      await render(ghost());

      expect(style().textDecorationLine).toBe('underline');
      expect(style().color).toBe(colors[theme].ink);
    });

    it('stays underlined, on a fresh label, when the scheme switches at runtime', async () => {
      jest.mocked(useColorScheme).mockReturnValue('dark');
      const { rerender } = await render(ghost());
      const before = label();

      // Android drops textDecorationLine from a mounted Text whose color changes, so the label must be remounted.
      jest.mocked(useColorScheme).mockReturnValue('light');
      await rerender(ghost());

      expect(label()).not.toBe(before);
      expect(style().textDecorationLine).toBe('underline');
      expect(style().color).toBe(colors.light.ink);
    });
  });

  describe('lock icon', () => {
    const lockPaths = () =>
      screen.container.queryAll((node) => node.type === 'RNSVGPath' && node.props.d === iconPaths.lock);

    it('shows a lock hidden from screen readers when unavailable', async () => {
      await render(<Button label="Autorizar" disabledReason="Solo el acudiente" onPress={jest.fn()} />);

      expect(lockPaths()).toHaveLength(1);
      expect(screen.queryByRole('image')).toBeNull();
      const svg = screen.container.queryAll((node) => node.type === 'RNSVGSvgView')[0];
      expect(svg.props.width).toBe(size['icon-sm']);
      expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
    });

    it('is not shown on an available button', async () => {
      await render(<Button label="Autorizar" onPress={jest.fn()} />);

      expect(lockPaths()).toHaveLength(0);
    });

    it('is not shown while loading, which shows the spinner instead', async () => {
      await render(<Button label="Guardar" loading onPress={jest.fn()} />);

      expect(lockPaths()).toHaveLength(0);
      expect(screen.container.queryAll((node) => node.type === 'ActivityIndicator')).toHaveLength(1);
    });
  });

  describe('trailing icon', () => {
    it('draws after the label, and not on an unavailable or loading button', async () => {
      const { rerender } = await render(<Button label="Terminar" trailingIcon={<Text>→</Text>} onPress={jest.fn()} />);
      const children = screen.getByRole('button').children.map((node) => (typeof node === 'string' ? node : node.props?.children));
      expect(children.flat()).toEqual(['Terminar', '→']);

      await rerender(<Button label="Terminar" trailingIcon={<Text>→</Text>} disabledReason="Falta algo" onPress={jest.fn()} />);
      expect(screen.queryByText('→', { includeHiddenElements: true })).toBeNull();

      await rerender(<Button label="Terminar" trailingIcon={<Text>→</Text>} loading onPress={jest.fn()} />);
      expect(screen.queryByText('→', { includeHiddenElements: true })).toBeNull();
    });
  });

  it.each(variants)('%s keeps at least target-min height and a pill radius', async (variant) => {
    await render(<Button label="Continuar" variant={variant} onPress={jest.fn()} />);

    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(size['target-min']);
    expect(style.borderRadius).toBe(999);
  });

  it('uses the timing heights: 72 and target-timing for Stop', async () => {
    await render(
      <>
        <Button label="Parcial" variant="secondary" size="timing" onPress={jest.fn()} />
        <Button label="Detener" variant="stop" size="timing" onPress={jest.fn()} />
      </>,
    );

    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Parcial' }).props.style).minHeight).toBe(72);
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Detener' }).props.style).minHeight).toBe(
      size['target-timing'],
    );
  });

  it('draws Stop coral on the clock only when asked, near-black otherwise', async () => {
    await render(
      <>
        <Button label="Detener" variant="stop" onClock onPress={jest.fn()} />
        <Button label="Parar" variant="stop" onPress={jest.fn()} />
      </>,
    );

    const background = (name: string) =>
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor;
    expect(background('Detener')).toBe(colors.light[onClockStopColors.background]);
    expect(background('Parar')).toBe(colors.light[buttonColors.stop.background!]);
    expect(onClockStopColors).toEqual({ background: 'coral', text: 'on-color' });
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it('on-clock Stop text is at least 4.5:1 on coral at rest and pressed', () => {
      const { background, text } = onClockStopColors;
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[text], darken(c[background], 0.08))).toBeGreaterThanOrEqual(4.5);
    });
    // A transparent button sits on the canvas or on a card.
    const surfaces = (bg: (typeof buttonColors)[ButtonVariant]['background']) =>
      bg ? [c[bg]] : [c['surface-0'], c['surface-1']];

    it.each(variants)('%s text is at least 4.5:1 at rest and pressed', (variant) => {
      const { background, text } = buttonColors[variant];
      for (const surface of surfaces(background)) {
        expect(contrastRatio(c[text], surface)).toBeGreaterThanOrEqual(4.5);
        const pressed = background ? [c[text], darken(surface, 0.08)] : [darken(c[text], 0.08), surface];
        expect(contrastRatio(pressed[0], pressed[1])).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('unavailable text is at least 4.5:1', () => {
      expect(contrastRatio(c[unavailableColors.text], c[unavailableColors.background])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
