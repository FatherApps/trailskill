import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
import { ChoiceCard } from '../components/ChoiceCard';

const props = { title: 'Yo', detail: 'Soy mayor de edad y nado', icon: 'person', color: 'lilac', onPress: jest.fn() } as const;

describe('ChoiceCard', () => {
  it('is a radio with its checked state, a surface card when not chosen', async () => {
    const onPress = jest.fn();
    await render(<ChoiceCard {...props} selected={false} onPress={onPress} />);

    const card = screen.getByRole('radio', { name: 'Yo, Soy mayor de edad y nado' });
    expect(card).not.toBeChecked();
    expect(StyleSheet.flatten(card.props.style).backgroundColor).toBe(colors.light['surface-1']);
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('takes its color and an outline when chosen, with the same border width so nothing shifts', async () => {
    const { rerender } = await render(<ChoiceCard {...props} selected={false} />);
    const before = StyleSheet.flatten(screen.getByRole('radio').props.style);

    await rerender(<ChoiceCard {...props} selected />);

    const after = StyleSheet.flatten(screen.getByRole('radio').props.style);
    expect(screen.getByRole('radio')).toBeChecked();
    expect(after.backgroundColor).toBe(colors.light.lilac);
    expect(after.borderColor).toBe(colors.light.primary);
    expect(after.borderWidth).toBe(before.borderWidth);
  });
});
