import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, size } from '../../../core/theme';
import { ArrivalButton } from '../components/ArrivalButton';

describe('ArrivalButton', () => {
  it('is the lime primary Llegada button and emits onArrival', async () => {
    const onArrival = jest.fn();
    await render(<ArrivalButton onArrival={onArrival} />);

    const button = screen.getByRole('button', { name: 'Llegada' });
    expect(StyleSheet.flatten(button.props.style)?.backgroundColor).toBe(colors.light.action);
    await fireEvent.press(button);
    expect(onArrival).toHaveBeenCalledTimes(1);
  });

  it('has a touch target of 88 dp that also emits onArrival once', async () => {
    const onArrival = jest.fn();
    await render(<ArrivalButton onArrival={onArrival} />);

    const target = screen.getByTestId('arrival-target');
    expect(StyleSheet.flatten(target.props.style)?.minHeight).toBe(size['target-timing']);
    await fireEvent.press(target);
    expect(onArrival).toHaveBeenCalledTimes(1);
  });
});
