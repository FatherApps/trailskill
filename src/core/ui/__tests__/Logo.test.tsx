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

      // The water and the two paths of the swimmer of the official file, by their first segments.
      expect(fills().map((d) => d.slice(0, 29))).toEqual(['M20.6 68.77 L21.04 68.77 L21.', 'M123.25 361.49 C130.37 360.99', 'M150.62 291.48 C158.64 290.79']);
      // The coral head of the swimmer.
      expect(screen.container.queryAll((node) => node.props.cx === 68.71 && node.props.cy === 56.39 && node.props.r === 4.82)).not.toHaveLength(0);
      // The water is clipped to the inside of the ring, and the file scales the whole mark by 0.64.
      expect(screen.container.queryAll((node) => node.props.cx === 50 && node.props.cy === 56.5 && node.props.r === 25.9)).not.toHaveLength(0);
      expect(screen.container.queryAll((node) => node.props.matrix?.[0] === 0.64 && node.props.matrix?.[3] === 0.64)).not.toHaveLength(0);
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
