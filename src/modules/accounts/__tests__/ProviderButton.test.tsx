import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, radius, size, ThemeProvider } from '../../../core/theme';
import { ChoiceRow } from '../components/ChoiceRow';
import { ProviderButton } from '../components/ProviderButton';
import { googleMark } from '../components/providerMarks';

describe('ProviderButton', () => {
  it.each(['google', 'microsoft'] as const)('%s: a labelled button with its own mark', async (provider) => {
    const onPress = jest.fn();
    const label = provider === 'google' ? 'Continuar con Google' : 'Continuar con Microsoft';
    await render(<ProviderButton provider={provider} onPress={onPress} />);

    const button = screen.getByRole('button', { name: label });
    expect(screen.getByText(label)).toBeOnTheScreen();
    const style = StyleSheet.flatten(button.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(size['target-min']);
    expect(style.borderRadius).toBe(radius.full);
    expect(style.backgroundColor).toBe(colors.light['surface-1']);
    expect(style.borderColor).toBe(colors.light['border-strong']);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['light', 'dark'] as const)('google: the G sits on a white disc in the %s theme', async (name) => {
    await render(
      <ThemeProvider name={name}>
        <ProviderButton provider="google" onPress={jest.fn()} />
      </ThemeProvider>,
    );

    const disc = screen.getByTestId('provider-mark-disc', { includeHiddenElements: true });
    const image = disc.children[0];
    if (typeof image === 'string') throw new Error('the disc must hold the G image');
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 20, height: 20 });
    expect(StyleSheet.flatten(disc.props.style)).toMatchObject({
      backgroundColor: googleMark.background,
      width: 28,
      height: 28,
      borderRadius: radius.full,
    });
  });

  it('microsoft: the mark has no disc', async () => {
    await render(<ProviderButton provider="microsoft" onPress={jest.fn()} />);

    expect(screen.queryByTestId('provider-mark-disc', { includeHiddenElements: true })).toBeNull();
      });

  it('keeps its identity when it cannot be used: provider and reason in text and accessible name', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <ProviderButton provider="google" disabledReason="Necesitas señal" onPress={onPress} />
        <ProviderButton provider="microsoft" disabledReason="Necesitas señal" onPress={onPress} />
      </>,
    );

    for (const text of ['Continuar con Google · Necesitas señal', 'Continuar con Microsoft · Necesitas señal']) {
      const button = screen.getByRole('button', { name: text });
      expect(screen.getByText(text)).toBeOnTheScreen();
      expect(button.props.accessibilityLabel).toBe(text);
      expect(button).toBeDisabled();
      await fireEvent.press(button);
    }
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ChoiceRow', () => {
  it('is a radio with its checked state and a target of at least 64', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(
      <ChoiceRow title="Yo" detail="Soy mayor de edad y nado" icon="person" color="athlete-2" selected={false} onPress={onPress} />,
    );

    const row = screen.getByRole('radio', { name: 'Yo, Soy mayor de edad y nado' });
    expect(row).not.toBeChecked();
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(64);
    expect(StyleSheet.flatten(row.props.style).backgroundColor).toBe(colors.light['surface-1']);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(
      <ChoiceRow title="Yo" detail="Soy mayor de edad y nado" icon="person" color="athlete-2" selected onPress={onPress} />,
    );
    expect(screen.getByRole('radio')).toBeChecked();
    expect(StyleSheet.flatten(screen.getByRole('radio').props.style).backgroundColor).toBe(
      colors.light['primary-tint'],
    );
  });
});
