import { render, screen } from '@testing-library/react-native';
import { processColor, StyleSheet, Text } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../theme';
import { Banner, bannerColors, type BannerVariant } from '../Banner';
import { iconPaths } from '../icons';

const themes: ThemeName[] = ['light', 'dark'];
const variants = Object.keys(bannerColors) as BannerVariant[];

describe('Banner', () => {
  it('has exactly the info, warn and success variants', () => {
    expect(variants.sort()).toEqual(['info', 'success', 'warn']);
  });

  it.each(variants)('%s shows its text with nested emphasis and uses its color tokens', async (variant) => {
    await render(
      <Banner variant={variant} icon="info">
        Te invitó <Text style={{ fontWeight: '600' }}>Escuela Delfines</Text>. Listo.
      </Banner>,
    );

    expect(screen.getByText('Escuela Delfines')).toBeOnTheScreen();
    expect(screen.getByText(/Te invitó/)).toBeOnTheScreen();
    const tokens = bannerColors[variant];
    const box = screen.getByTestId('banner');
    expect(StyleSheet.flatten(box.props.style).backgroundColor).toBe(colors.light[tokens.background]);
    expect(StyleSheet.flatten(screen.getByText(/Te invitó/).props.style).color).toBe(colors.light[tokens.text]);
    const paths = screen.container.queryAll((node) => node.type === 'RNSVGPath');
    expect(paths).toHaveLength(1);
    expect(paths[0].props.d).toBe(iconPaths.info);
    expect(paths[0].props.fill).toEqual({ type: 0, payload: processColor(colors.light[tokens.icon]) });
  });

  it('renders no icon and keeps the text when icon is omitted', async () => {
    await render(<Banner variant="info">Los menores no crean su propia cuenta.</Banner>);

    expect(screen.container.queryAll((node) => node.type === 'RNSVGPath')).toHaveLength(0);
    expect(screen.getByText('Los menores no crean su propia cuenta.')).toBeOnTheScreen();
  });

  it('hides the icon from accessibility and leaves the text as the meaning', async () => {
    await render(
      <Banner variant="info" icon="info">
        Los menores no crean su propia cuenta.
      </Banner>,
    );

    const svg = screen.container.queryAll((node) => node.type === 'RNSVGSvgView' || node.props.viewBox)[0];
    expect(svg.props.accessible).toBe(false);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.getByText('Los menores no crean su propia cuenta.')).toBeOnTheScreen();
  });

  it.each(variants)('%s live region: polite only for warn', async (variant) => {
    await render(
      <Banner variant={variant} icon="info">
        Texto
      </Banner>,
    );

    const live = screen.getByTestId('banner').props.accessibilityLiveRegion;
    if (variant === 'warn') expect(live).toBe('polite');
    else expect(live === undefined || live === 'none').toBe(true);
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each(variants)('%s text is at least 4.5:1 and icon at least 3:1', (variant) => {
      const { background, text, icon } = bannerColors[variant];
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[icon], c[background])).toBeGreaterThanOrEqual(3);
    });
  });
});
