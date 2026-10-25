import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, darken, size, type ThemeName } from '../../theme';
import { Button, buttonColors, unavailableColors, type ButtonVariant } from '../Button';

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

    const button = screen.getByRole('button', { name: 'Autorizar' });
    expect(button).toBeDisabled();
    expect(button.props.accessibilityHint).toBe('Solo el acudiente puede autorizar');
    expect(screen.getByText('Solo el acudiente puede autorizar')).toBeOnTheScreen();

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
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

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];
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
