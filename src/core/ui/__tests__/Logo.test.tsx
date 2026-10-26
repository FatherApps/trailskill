import { render, screen } from '@testing-library/react-native';

import { colors, ThemeProvider, type ThemeName } from '../../theme';
import { Logo, LogoSymbol, logoColors } from '../Logo';

const themes: ThemeName[] = ['light', 'dark'];

const fills = () =>
  screen.container
    .queryAll((node) => typeof node.props.d === 'string')
    .map((node) => node.props.d as string);

describe('Logo', () => {
  it('is one labelled image with the lockup proportions', async () => {
    await render(<Logo height={32} />);

    const logo = screen.getByRole('image', { name: 'TrailSkill' });
    expect(logo.props.width).toBe((32 * 219) / 64);
    expect(logo.props.height).toBe(32);
    expect([logo.props.vbWidth, logo.props.vbHeight]).toEqual([219, 64]);
  });

  it('draws the wordmark and its dot from the lockup paths', async () => {
    await render(<Logo />);

    const paths = fills();
    expect(paths.some((d) => d.startsWith('M91.46000000000001 23.880000000000003V44.215H86.84'))).toBe(true);
    expect(paths.some((d) => d.startsWith('M192.50500000000002 23.285Q191.10500000000002'))).toBe(true);
  });

  it('has the dark badge on the light theme and none on the reversed one', async () => {
    await render(<ThemeProvider name="light"><Logo /></ThemeProvider>);
    expect(screen.container.queryAll((node) => node.props.rx === 16)).toHaveLength(1);

    await screen.unmount();
    await render(<ThemeProvider name="dark"><Logo /></ThemeProvider>);
    expect(screen.container.queryAll((node) => node.props.rx === 16)).toHaveLength(0);
  });

  it('is hidden from screen readers when decorative, so a title beside it is not announced twice', async () => {
    await render(<><Logo decorative /><LogoSymbol decorative /></>);
    expect(screen.queryByRole('image', { name: 'TrailSkill' })).toBeNull();
    expect(screen.queryAllByLabelText('TrailSkill')).toHaveLength(0);
  });

  describe('LogoSymbol', () => {
    it('is one labelled square image, 44 dp by default', async () => {
      await render(<LogoSymbol />);

      const symbol = screen.getByRole('image', { name: 'TrailSkill' });
      expect([symbol.props.width, symbol.props.height]).toEqual([44, 44]);
      expect([symbol.props.vbWidth, symbol.props.vbHeight]).toEqual([64, 64]);
    });

    it('takes its size from the prop', async () => {
      await render(<LogoSymbol size={26} />);
      expect(screen.getByRole('image').props.width).toBe(26);
    });

    it('draws the mark of trailskill-symbol.svg without the wordmark', async () => {
      await render(<ThemeProvider name="light"><LogoSymbol /></ThemeProvider>);

      // The polyline of the official file, which the SVG library turns into path data.
      expect(fills()).toEqual(['M17.02695526217005 43.72304473782995 24.35 36.4 33.35 42.9 43.69 27.39']);
      expect(screen.container.queryAll((node) => node.props.cx === 49.35 && node.props.cy === 18.9 && node.props.r === 7)).not.toHaveLength(0);
    });

    it('has the dark badge on the light theme and none on the reversed one', async () => {
      await render(<ThemeProvider name="light"><LogoSymbol /></ThemeProvider>);
      expect(screen.container.queryAll((node) => node.props.rx === 16)).toHaveLength(1);

      await screen.unmount();
      await render(<ThemeProvider name="dark"><LogoSymbol /></ThemeProvider>);
      expect(screen.container.queryAll((node) => node.props.rx === 16)).toHaveLength(0);
    });
  });

  it.each(themes)('paints only theme tokens in the %s theme (the lockup colors are tokens)', (theme) => {
    const palette = logoColors[theme];
    const values = [palette.badge, palette.symbol, palette.wordmark, palette.accent].filter(Boolean) as (keyof typeof colors.light)[];
    expect(values.every((token) => token in colors[theme])).toBe(true);
    // The reversed lockup is white on the dark canvas, the light lockup dark on the light canvas.
    expect(palette.wordmark).toBe(theme === 'light' ? 'ink' : 'on-header');
    expect(palette.accent).toBe('coral');
  });
});
