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

    const logo = screen.getByRole('image', { name: 'Swimcro' });
    expect(logo.props.width).toBe((32 * 221) / 64);
    expect(logo.props.height).toBe(32);
    expect([logo.props.vbWidth, logo.props.vbHeight]).toEqual([221, 64]);
  });

  it('draws the wordmark and its dot from the lockup paths', async () => {
    await render(<Logo />);

    const paths = fills();
    expect(paths.some((d) => d.startsWith('M89.465 44.635000000000005Q86.315 44.635000000000005 84.1275'))).toBe(true);
    expect(paths.some((d) => d.startsWith('M132.83 23.285Q131.43'))).toBe(true);
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
    expect(screen.queryByRole('image', { name: 'Swimcro' })).toBeNull();
    expect(screen.queryAllByLabelText('Swimcro')).toHaveLength(0);
  });

  describe('LogoSymbol', () => {
    it('is one labelled square image, 44 dp by default', async () => {
      await render(<LogoSymbol />);

      const symbol = screen.getByRole('image', { name: 'Swimcro' });
      expect([symbol.props.width, symbol.props.height]).toEqual([44, 44]);
      expect([symbol.props.vbWidth, symbol.props.vbHeight]).toEqual([64, 64]);
    });

    it('takes its size from the prop', async () => {
      await render(<LogoSymbol size={26} />);
      expect(screen.getByRole('image').props.width).toBe(26);
    });

    it('draws the mark of swimcro-symbol.svg without the wordmark', async () => {
      await render(<ThemeProvider name="light"><LogoSymbol /></ThemeProvider>);

      // The stem, the crown button, the water and the swimmer's stroke of the official file.
      expect(fills()).toEqual([
        'M32 12 V16',
        'M47.5 21.5 L51 18',
        'M10 44 C16 40 22 48 28 44 S40 40 46 44 S58 48 62 44 V64 H10Z',
        'M19 43 C20 31 27 26 33.5 26 C40.5 26 45 31 46 41',
      ]);
      // The coral head of the swimmer.
      expect(screen.container.queryAll((node) => node.props.cx === 36 && node.props.cy === 37.5 && node.props.r === 5.4)).not.toHaveLength(0);
      // The water is clipped to the inside of the ring.
      expect(screen.container.queryAll((node) => node.props.cx === 32 && node.props.cy === 37 && node.props.r === 16.8)).not.toHaveLength(0);
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
