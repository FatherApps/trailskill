import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, radius } from '../../../core/theme';
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

  it('is a single accessible round button, far bigger than 72 dp, with no extra touchable around it', async () => {
    await render(<ArrivalButton onArrival={jest.fn()} />);

    expect(screen.getAllByRole('button', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.queryByTestId('arrival-target')).toBeNull();
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style?.minWidth).toBe(300);
    expect(style?.aspectRatio).toBe(1);
    expect(style?.width).toBeUndefined();
    expect(style?.height).toBeUndefined();
    expect(style?.borderRadius).toBe(radius.full);
  });

  it('says what to do and which position comes next, in mono', async () => {
    await render(<ArrivalButton onArrival={jest.fn()} nextPosition={4} />);

    expect(screen.getByRole('button', { name: 'Llegada' }).props.accessibilityHint).toBe('Toca cuando toque la pared');
    expect(screen.getByText('Toca cuando toque la pared')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('Siguiente: 4.º puesto').props.style)?.fontFamily).toBe('IBMPlexMono_500Medium');
  });

  it('names no position before the clock runs', async () => {
    await render(<ArrivalButton onArrival={jest.fn()} />);

    expect(screen.queryByText(/Siguiente/)).toBeNull();
  });

  it('has a shorter phone version without the hint', async () => {
    await render(<ArrivalButton compact onArrival={jest.fn()} nextPosition={4} />);

    expect(screen.getByText('Siguiente: 4.º')).toBeOnTheScreen();
    expect(screen.queryByText('Toca cuando toque la pared')).toBeNull();
    expect(StyleSheet.flatten(screen.getByRole('button').props.style)?.minWidth).toBe(290);
  });
});
