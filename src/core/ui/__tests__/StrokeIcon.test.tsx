import { processColor, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { colors, ThemeProvider, type ColorToken, type ThemeName } from '../../theme';
import { StrokeIcon } from '..';

const themes: ThemeName[] = ['light', 'dark'];

const pathsOf = () => screen.container.queryAll((node) => node.type === 'RNSVGPath');
const circlesOf = () => screen.container.queryAll((node) => node.type === 'RNSVGCircle');
const glyphSvg = () => screen.container.queryAll((node) => node.type === 'RNSVGSvgView')[0];
const paint = (theme: ThemeName, token: ColorToken) => ({ type: 0, payload: processColor(colors[theme][token]) });
const boxStyle = (name: string) => StyleSheet.flatten(screen.getByRole('image', { name }).props.style);
const inkOf = (node: { props: { stroke?: { payload: unknown }; fill?: { payload: unknown } } }) => [
  node.props.stroke?.payload,
  node.props.fill?.payload,
];

// One stroke of each glyph that no other glyph draws.
const signature: Record<string, string> = {
  FR: 'M12 17c2-7 8-10 13-6',
  BK: 'M20 18.5 17 5',
  BR: 'M13 19c-3-2-6-1.5-8 1M19 19c3-2 6-1.5 8 1',
  FL: 'M13.5 17C10.5 6 4.5 4 3 11M18.5 17C21.5 6 27.5 4 29 11',
};
const label: Record<string, string> = { FR: 'Libre', BK: 'Espalda', BR: 'Pecho', FL: 'Mariposa', IM: 'Combinado' };
const fixedColors = ['lilac', 'coral', 'sky', 'lime'] as const;

describe('StrokeIcon', () => {
  it.each(Object.keys(signature))('%s draws its own glyph on the water line', async (code) => {
    await render(<StrokeIcon stroke={code} />);

    const ds = pathsOf().map((node) => node.props.d as string);
    expect(ds).toContain(signature[code]);
    expect(ds).toContain('M3 25c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0 4.3-2 6.5 0 4.3 2 6.5 0');
    for (const other of Object.keys(signature).filter((c) => c !== code)) expect(ds).not.toContain(signature[other]);
  });

  it.each(themes)('IM draws four circles in the same fixed brand colors on %s, plus an outline of each', async (theme) => {
    await render(<ThemeProvider name={theme}><StrokeIcon stroke="IM" /></ThemeProvider>);

    const circles = circlesOf();
    expect(circles).toHaveLength(8);
    expect(circles.slice(0, 4).map((node) => node.props.fill)).toEqual(fixedColors.map((token) => paint(theme, token)));
    expect(circles.slice(4).every((node) => node.props.stroke?.payload === paint(theme, 'ink').payload)).toBe(true);
    expect(pathsOf()).toHaveLength(0);
  });

  it.each(['KICK', 'XX', '', 'constructor'])('a code without pictogram (%j) draws nothing and does not fail', async (code) => {
    await render(<StrokeIcon stroke={code} />);

    expect(screen.toJSON()).toBeNull();
  });

  describe('variants', () => {
    it('is md by default: a 44 box with a 34 glyph', async () => {
      await render(<StrokeIcon stroke="FR" />);

      const box = boxStyle('Libre');
      expect([box.width, box.height]).toEqual([44, 44]);
      expect([glyphSvg().props.width, glyphSvg().props.height]).toEqual([34, 34]);
      expect([glyphSvg().props.vbWidth, glyphSvg().props.vbHeight]).toEqual([32, 32]);
    });

    it('sm is a 32 box with a 24 glyph', async () => {
      await render(<StrokeIcon stroke="FR" size="sm" />);

      const box = boxStyle('Libre');
      expect([box.width, box.height]).toEqual([32, 32]);
      expect([glyphSvg().props.width, glyphSvg().props.height]).toEqual([24, 24]);
    });

    it.each(themes)('draws the glyph in ink on %s with no border and no background', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="FR" /></ThemeProvider>);

      expect(pathsOf().length).toBeGreaterThan(0);
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'ink').payload))).toBe(true);
      expect(boxStyle('Libre').borderWidth).toBeUndefined();
      expect(boxStyle('Libre').backgroundColor).toBeUndefined();
    });

    it.each(themes)('empty has a 1.5 dotted border-strong and an ink-muted glyph on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="BK" empty /></ThemeProvider>);

      const box = boxStyle('Espalda');
      expect(box.borderWidth).toBe(1.5);
      expect(box.borderStyle).toBe('dotted');
      expect(box.borderColor).toBe(colors[theme]['border-strong']);
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'ink-muted').payload))).toBe(true);
    });

    it.each(themes)('onColor has a 75 % white background and an on-color glyph on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="BR" onColor /></ThemeProvider>);

      const layers = screen.container.queryAll(
        (node) => node.props.style && StyleSheet.flatten(node.props.style).opacity === 0.75,
      );
      expect(layers).toHaveLength(1);
      expect(StyleSheet.flatten(layers[0].props.style).backgroundColor).toBe(colors[theme]['on-header']);
      expect(boxStyle('Pecho').opacity).toBeUndefined();
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'on-color').payload))).toBe(true);
    });

    it('IM keeps its four fixed colors in the empty and onColor variants', async () => {
      await render(<><StrokeIcon stroke="IM" empty /><StrokeIcon stroke="IM" onColor /></>);

      const fills = circlesOf().map((node) => node.props.fill);
      for (const start of [0, 8]) {
        expect(fills.slice(start, start + 4)).toEqual(fixedColors.map((token) => paint('light', token)));
      }
    });
  });

  describe('accessibility', () => {
    it.each(Object.entries(label))('%s is one image named %s', async (code, name) => {
      await render(<StrokeIcon stroke={code} />);

      expect(screen.getByRole('image', { name })).toBeOnTheScreen();
      expect(screen.getAllByRole('image')).toHaveLength(1);
    });

    it('is hidden from screen readers when decorative, so a card that already says the style does not repeat it', async () => {
      await render(<StrokeIcon stroke="FR" decorative />);

      expect(screen.queryByRole('image')).toBeNull();
      expect(screen.queryByLabelText('Libre')).toBeNull();
      expect(pathsOf().length).toBeGreaterThan(0);
    });
  });
});
