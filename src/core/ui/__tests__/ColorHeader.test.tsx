import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, radius, size, ThemeProvider } from '../../theme';
import { ColorHeader, colorHeaderColors } from '../ColorHeader';

const renderHeader = async (props: Partial<React.ComponentProps<typeof ColorHeader>> = {}) => {
  const onBack = jest.fn();
  await render(
    <ThemeProvider>
      <ColorHeader color="athlete-1" title="Lucía Ramírez" onBack={onBack} {...props} />
    </ThemeProvider>,
  );
  return onBack;
};

describe('ColorHeader', () => {
  it('shows the title as a header, the subtitle and its children', async () => {
    await renderHeader({ subtitle: 'Infantil B · Grupo B', children: <></> });

    expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
    expect(screen.getByText('Infantil B · Grupo B')).toBeOnTheScreen();
  });

  it('is a colour band with a large radius on the bottom corners only', async () => {
    await renderHeader({ color: 'athlete-3' });

    const style = StyleSheet.flatten((screen.toJSON() as unknown as { props: { style: unknown } }).props.style as object) as Record<string, number | string>;
    expect(style).toMatchObject({
      backgroundColor: colors.light['athlete-3'],
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
    });
    expect(style.borderTopLeftRadius).toBeUndefined();
  });

  it('has a round back button with an accessible name and a minimum touch target, that calls onBack', async () => {
    const onBack = await renderHeader();

    const back = screen.getByRole('button', { name: 'Volver' });
    const style = StyleSheet.flatten(back.props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(size['target-min']);
    expect(style.minHeight).toBeGreaterThanOrEqual(size['target-min']);
    expect(style.borderRadius).toBe(radius.full);
    expect(style.backgroundColor).toBe(colors.light[colorHeaderColors.backButton]);

    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('draws the arrow_back icon', async () => {
    await renderHeader();

    expect(screen.container.queryAll((node) => node.type === 'RNSVGPath')).toHaveLength(1);
  });

  it('shows a focus ring on the back button while it has the keyboard focus', async () => {
    await renderHeader();
    const back = screen.getByRole('button', { name: 'Volver' });

    await fireEvent(back, 'focus');

    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Volver' }).props.style)).toMatchObject({
      outlineColor: colors.light.focus,
      outlineWidth: 2,
    });
  });
});
