import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, radius, size } from '../../../core/theme';
import { ChoiceRow } from '../components/ChoiceRow';
import { ProviderButton } from '../components/ProviderButton';

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

  it('shows the reason instead of going silent when it cannot be used', async () => {
    const onPress = jest.fn();
    await render(<ProviderButton provider="google" disabledReason="Necesitas señal" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Continuar con Google' });
    expect(screen.getByText('Necesitas señal')).toBeOnTheScreen();
    expect(button).toBeDisabled();
    expect(button.props.accessibilityHint).toBe('Necesitas señal');
    await fireEvent.press(button);
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
