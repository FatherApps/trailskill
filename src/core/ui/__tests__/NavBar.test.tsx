import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, elevation, size, type ThemeName } from '../../theme';
import { iconPaths } from '../icons';
import { NavBar, navBarColors, type NavBarItem } from '../NavBar';

const themes: ThemeName[] = ['light', 'dark'];
const items: NavBarItem[] = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'swimmers', label: 'Nadadores', icon: 'group' },
  { id: 'times', label: 'Tiempos', icon: 'timer' },
  { id: 'account', label: 'Cuenta', icon: 'person' },
];

async function renderBar(activeId = 'home') {
  const onSelect = jest.fn();
  await render(<NavBar items={items} activeId={activeId} onSelect={onSelect} />);
  return onSelect;
}

// A tab list must not be `accessible` (that would hide its tabs from screen readers), so role queries skip it.
const tablistOf = () => screen.container.queryAll((node) => node.props.accessibilityRole === 'tablist');
const style = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never);

describe('NavBar', () => {
  it('is a tab list with one tab per item, named by its label', async () => {
    await renderBar();

    expect(tablistOf()).toHaveLength(1);
    expect(tablistOf()[0].props.accessible).not.toBe(true);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    for (const { label } of items) expect(screen.getByRole('tab', { name: label })).toBeOnTheScreen();
  });

  it('marks only the active item as selected', async () => {
    await renderBar('times');

    expect(screen.getByRole('tab', { name: 'Tiempos' }).props.accessibilityState).toMatchObject({ selected: true });
    for (const label of ['Inicio', 'Nadadores', 'Cuenta']) {
      expect(screen.getByRole('tab', { name: label }).props.accessibilityState).toMatchObject({ selected: false });
    }
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  });

  it('calls onSelect with the id of the pressed item', async () => {
    const onSelect = await renderBar();

    await fireEvent.press(screen.getByRole('tab', { name: 'Nadadores' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('swimmers');
  });

  it('shows the label of the active item only; the others keep it as their accessible name', async () => {
    await renderBar('swimmers');

    expect(screen.getByText('Nadadores')).toBeOnTheScreen();
    for (const label of ['Inicio', 'Tiempos', 'Cuenta']) expect(screen.queryByText(label)).toBeNull();
  });

  it('draws the icon of every item', async () => {
    await renderBar();

    const drawn = screen.container.queryAll((node) => node.type === 'RNSVGPath').map((path) => path.props.d);
    expect(drawn).toEqual([iconPaths.home, iconPaths.group, iconPaths.timer, iconPaths.person]);
  });

  it('respects the bottom safe area', async () => {
    await renderBar();

    // SafeAreaView normalises `edges={['bottom']}` to a per-edge mode object.
    const safe = screen.container.queryAll((node) => node.type === 'RNCSafeAreaView');
    expect(safe).toHaveLength(1);
    expect(safe[0].props.edges).toMatchObject({ bottom: 'additive', top: 'off', left: 'off', right: 'off' });
  });

  it('floats as a pill with elevation-1', async () => {
    await renderBar();

    const bar = style(tablistOf()[0]);
    expect(bar).toMatchObject({ borderRadius: 999, backgroundColor: colors.light['surface-1'] });
    expect(bar).toMatchObject(elevation.light['elevation-1']);
  });

  it('makes every item at least 48 dp tall, a pill, and active in primary / on-primary', async () => {
    await renderBar('home');

    for (const tab of screen.getAllByRole('tab')) {
      const tabStyle = style(tab);
      expect(tabStyle.minHeight).toBeGreaterThanOrEqual(48);
      expect(tabStyle.minHeight).toBe(size['target-min']);
      expect(tabStyle.borderRadius).toBe(999);
      expect(tabStyle.height).toBeUndefined();
    }
    expect(style(screen.getByRole('tab', { name: 'Inicio' })).backgroundColor).toBe(colors.light.primary);
    expect(style(screen.getByRole('tab', { name: 'Cuenta' })).backgroundColor).not.toBe(colors.light.primary);
    expect(style(screen.getByText('Inicio')).color).toBe(colors.light['on-primary']);
  });

  it('lets a long active label wrap instead of clipping it', async () => {
    await render(
      <NavBar
        items={[
          { id: 'a', label: 'Nadadores de mi grupo', icon: 'group' },
          { id: 'b', label: 'Cuenta', icon: 'person' },
        ]}
        activeId="a"
        onSelect={jest.fn()}
      />,
    );

    const label = screen.getByText('Nadadores de mi grupo');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.allowFontScaling).not.toBe(false);
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it('active label and icon (on-primary) on primary is at least 4.5:1', () => {
      const { background, text } = navBarColors.active;
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
    });

    it('inactive icon (ink-muted) on the bar (surface-1) is at least 4.5:1', () => {
      expect(contrastRatio(c[navBarColors.inactive], c[navBarColors.bar])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
