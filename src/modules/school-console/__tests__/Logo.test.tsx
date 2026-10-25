import { render, screen } from '@testing-library/react-native';

import { colors, ThemeProvider, type ThemeName } from '../../../core/theme';
import { Logo, logoColors } from '../components/Logo';

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

  it.each(themes)('paints only theme tokens in the %s theme (the lockup colors are tokens)', (theme) => {
    const palette = logoColors[theme];
    const values = [palette.badge, palette.symbol, palette.wordmark, palette.accent].filter(Boolean) as (keyof typeof colors.light)[];
    expect(values.every((token) => token in colors[theme])).toBe(true);
    // The reversed lockup is white on the dark canvas, the light lockup dark on the light canvas.
    expect(colors[theme][palette.wordmark]).toBe(theme === 'light' ? '#141414' : '#FFFFFF');
    expect(colors[theme][palette.accent]).toBe('#FF5E45');
  });
});
