import { processColor } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { colors, size } from '../../theme';
import { Icon, iconPaths, type IconName } from '..';

const names = Object.keys(iconPaths) as IconName[];

const svgOf = () => screen.container.queryAll((node) => node.type === 'RNSVGSvgView');
const pathsOf = () => screen.container.queryAll((node) => node.type === 'RNSVGPath');
const fillOf = (token: keyof (typeof colors)['light']) => ({
  type: 0,
  payload: processColor(colors.light[token]),
});

describe('Icon', () => {
  it('bundles exactly the design system subset plus the icons of Banner and the registration screens', () => {
    expect([...names].sort()).toEqual(
      [
        'timer',
        'group',
        'sports',
        'leaderboard',
        'shield_person',
        'cloud_download',
        'link',
        'wifi_off',
        'cloud_done',
        'cloud_off',
        'rule',
        'lock',
        'error',
        'play_arrow',
        'expand_more',
        'emoji_events',
        'verified_user',
        'schedule',
        'home',
        'person',
        'chevron_right',
        'check',
        'arrow_upward',
        'arrow_downward',
        'info',
        'check_circle',
        'family_restroom',
        'radio_button_checked',
        'radio_button_unchecked',
        'school',
      ].sort(),
    );
  });

  it.each(names)('draws %s as one path of its own symbol', async (name) => {
    await render(<Icon name={name} />);

    expect(svgOf()).toHaveLength(1);
    const paths = pathsOf();
    expect(paths).toHaveLength(1);
    expect(paths[0].props.d).toBe(iconPaths[name]);
    expect(svgOf()[0].props.vbHeight).toBe(960);
    expect(svgOf()[0].props.minY).toBe(-960);
  });

  it('defaults to icon-md and the ink color', async () => {
    await render(<Icon name="timer" />);

    expect(svgOf()[0].props.width).toBe(size['icon-md']);
    expect(svgOf()[0].props.height).toBe(size['icon-md']);
    expect(pathsOf()[0].props.fill).toEqual(fillOf('ink'));
  });

  it('draws icon-sm at its token size', async () => {
    await render(<Icon name="timer" size="icon-sm" />);

    expect(svgOf()[0].props.width).toBe(size['icon-sm']);
    expect(svgOf()[0].props.height).toBe(size['icon-sm']);
  });

  it('paints the path with the theme color of the given token', async () => {
    await render(<Icon name="error" color="danger-text" />);

    expect(pathsOf()[0].props.fill).toEqual(fillOf('danger-text'));
    expect(pathsOf()[0].props.fill).not.toEqual(fillOf('ink'));
  });

  it('is hidden from screen readers when it has no label', async () => {
    await render(<Icon name="lock" />);

    expect(screen.queryByRole('image')).toBeNull();
    const svg = svgOf()[0];
    expect(svg.props.accessible).toBe(false);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(svg.props.accessibilityElementsHidden).toBe(true);
  });

  it('is an image with its label when it carries meaning', async () => {
    await render(<Icon name="wifi_off" accessibilityLabel="Sin conexión" />);

    expect(screen.getByRole('image', { name: 'Sin conexión' })).toBeOnTheScreen();
  });

  it('fails type checking with a name, size or color outside the set', () => {
    const typeOnly = () => (
      <>
        {/* @ts-expect-error favorite is not in the bundled subset */}
        <Icon name="favorite" />
        {/* @ts-expect-error only icon-md and icon-sm are sizes */}
        <Icon name="lock" size={30} />
        {/* @ts-expect-error colors are theme tokens, never raw values */}
        <Icon name="lock" color="red" />
      </>
    );
    expect(typeOnly).toBeDefined();
  });
});
