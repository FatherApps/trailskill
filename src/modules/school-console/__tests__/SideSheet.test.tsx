import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, StyleSheet, Text } from 'react-native';

import { colors, ThemeProvider } from '../../../core/theme';
import { SideSheet } from '../components/SideSheet';

const show = (onClose = jest.fn()) =>
  render(
    <SideSheet label="Detalle de Lucía Ramírez" onClose={onClose}>
      <Text>Contenido del detalle</Text>
    </SideSheet>,
  );

describe('SideSheet', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is a modal sheet 340 wide on the right with its content and a labelled Cerrar button', async () => {
    await show();

    expect(screen.getByText('Contenido del detalle')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeOnTheScreen();
    const sheet = StyleSheet.flatten(screen.getByTestId('side-sheet').props.style);
    expect(sheet).toMatchObject({ width: 340, backgroundColor: colors.light['surface-1'] });
    expect(screen.getByTestId('side-sheet').props.accessibilityLabel).toBe('Detalle de Lucía Ramírez');
    expect(screen.getByTestId('side-sheet-overlay').props.accessibilityViewIsModal).toBe(true);
  });

  it('closes from the Cerrar button', async () => {
    const onClose = jest.fn();
    await show(onClose);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the scrim is tapped, and the scrim is not an accessibility target', async () => {
    const onClose = jest.fn();
    await show(onClose);

    await fireEvent.press(screen.getByTestId('side-sheet-scrim'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('side-sheet-scrim').props.accessible).toBe(false);
    expect(StyleSheet.flatten(screen.getByTestId('side-sheet-scrim').props.style).backgroundColor).toBe(colors.light.scrim);
  });

  it('closes with the Android back button', async () => {
    let handler: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, listener) => {
      handler = listener;
      return { remove: jest.fn() };
    });
    const onClose = jest.fn();
    await show(onClose);

    expect(handler?.(undefined as never)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the screen reader focus into the sheet when it opens', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    // The React Native jest setup already mocks it, so calls from earlier tests are still recorded.
    focus.mockClear();
    await show();

    expect(focus.mock.calls.filter(([, event]) => event === 'focus')).toHaveLength(1);
  });

  it('follows the theme', async () => {
    await render(<ThemeProvider name="dark"><SideSheet label="x" onClose={() => {}}><Text>a</Text></SideSheet></ThemeProvider>);

    expect(StyleSheet.flatten(screen.getByTestId('side-sheet').props.style).backgroundColor).toBe(colors.dark['surface-1']);
  });
});
