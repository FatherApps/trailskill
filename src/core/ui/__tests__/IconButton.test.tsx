import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, size } from '../../theme';
import { IconButton } from '..';

const button = () => screen.getByRole('button', { name: 'Cerrar' });

describe('IconButton', () => {
  it('is named by its label, since the icon is decorative', async () => {
    await render(<IconButton icon="close" label="Cerrar" onPress={() => {}} />);

    expect(button()).toBeOnTheScreen();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="close" label="Cerrar" onPress={onPress} />);

    await fireEvent.press(button());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the minimum touch target and a round shape', async () => {
    await render(<IconButton icon="close" label="Cerrar" onPress={() => {}} />);

    expect(StyleSheet.flatten(button().props.style)).toMatchObject({
      width: size['target-min'],
      height: size['target-min'],
      backgroundColor: colors.light['surface-2'],
    });
  });

  it('shows the focus ring while it has keyboard focus and drops it on blur', async () => {
    await render(<IconButton icon="close" label="Cerrar" onPress={() => {}} />);
    const outlineWidth = () => StyleSheet.flatten(button().props.style).outlineWidth;
    expect(outlineWidth()).toBeUndefined();

    await fireEvent(button(), 'focus');
    expect(StyleSheet.flatten(button().props.style)).toMatchObject({ outlineColor: colors.light.focus, outlineWidth: 2 });

    await fireEvent(button(), 'blur');
    expect(outlineWidth()).toBeUndefined();
  });
});
