import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
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

  it('is a single accessible button of at least 72 dp, with no extra touchable around it', async () => {
    await render(<ArrivalButton onArrival={jest.fn()} />);

    expect(screen.getAllByRole('button', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.queryByTestId('arrival-target')).toBeNull();
    expect(StyleSheet.flatten(screen.getByRole('button').props.style)?.minHeight).toBeGreaterThanOrEqual(72);
  });
});
