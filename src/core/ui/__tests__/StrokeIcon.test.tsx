import { processColor, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { colors, radius, ThemeProvider, type ColorToken, type ThemeName } from '../../theme';
import type { StrokeCode } from '../../sport';
import { StrokeIcon } from '..';

const themes: ThemeName[] = ['light', 'dark'];

const pathsOf = () => screen.container.queryAll((node) => node.type === 'RNSVGPath');
const circlesOf = () => screen.container.queryAll((node) => node.type === 'RNSVGCircle');
const ringsOf = () => circlesOf().filter((node) => node.props.strokeDasharray);
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
    await render(<StrokeIcon stroke={code as StrokeCode} />);

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

  it('only accepts a StrokeCode, so a typo is a compile error', () => {
    // @ts-expect-error 'XX' is not a StrokeCode
    const typo = <StrokeIcon stroke="XX" />;
    expect(typo).toBeDefined();
  });

  // Callers filter with isStroke; the guard stays as defense when a value slips through at runtime.
  it.each(['KICK', 'XX', '', 'constructor'])('a code without pictogram (%j) draws nothing and does not fail', async (code) => {
    await render(<StrokeIcon stroke={code as StrokeCode} />);

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

    it.each(['empty', 'onColor'] as const)('sm keeps the %s variant at 32 with a 24 glyph', async (variant) => {
      await render(<StrokeIcon stroke="FR" size="sm" variant={variant} />);

      const box = boxStyle('Libre');
      expect([box.width, box.height]).toEqual([32, 32]);
      expect(glyphSvg().props.width).toBe(24);
    });

    it('variant default is the same as no variant', async () => {
      await render(<StrokeIcon stroke="FR" variant="default" />);

      expect(boxStyle('Libre').backgroundColor).toBe(colors.light['surface-2']);
    });

    it.each(themes)('md is a circle with a surface-2 background and an ink glyph, with no border, on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="FR" /></ThemeProvider>);

      const box = boxStyle('Libre');
      expect(box.borderRadius).toBe(radius.full);
      expect(box.backgroundColor).toBe(colors[theme]['surface-2']);
      expect(box.borderWidth).toBeUndefined();
      expect(pathsOf().length).toBeGreaterThan(0);
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'ink').payload))).toBe(true);
    });

    it.each(themes)('sm is a circle with a surface-2 background and an ink glyph, with no border, on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="FR" size="sm" /></ThemeProvider>);

      const box = boxStyle('Libre');
      expect(box.borderRadius).toBe(radius.full);
      expect(box.backgroundColor).toBe(colors[theme]['surface-2']);
      expect(box.borderWidth).toBeUndefined();
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'ink').payload))).toBe(true);
    });

    it.each(themes)('empty has an ink-muted glyph and a transparent circle box on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="BK" variant="empty" /></ThemeProvider>);

      const box = boxStyle('Espalda');
      expect(box.borderRadius).toBe(radius.full);
      expect(box.backgroundColor).toBeUndefined();
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'ink-muted').payload))).toBe(true);
    });

    // Android draws a dotted View border as solid or warped on a rounded view, so the ring is an SVG circle.
    it.each(themes)('empty draws a dashed 1.5 border-strong SVG ring and no View border on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="BK" variant="empty" /></ThemeProvider>);

      const box = boxStyle('Espalda');
      expect(box.borderWidth).toBeUndefined();
      expect(box.borderStyle).toBeUndefined();
      expect(box.borderColor).toBeUndefined();
      const rings = ringsOf();
      expect(rings).toHaveLength(1);
      expect(rings[0].props.strokeWidth).toBe(1.5);
      expect(rings[0].props.stroke.payload).toBe(paint(theme, 'border-strong').payload);
      expect(rings[0].props.strokeDasharray.length).toBeGreaterThan(0);
      expect(rings[0].props.fill).toBeNull();
    });

    it.each([['md', 44], ['sm', 32]] as const)('the empty %s ring is a circle inside the %i box', async (size, box) => {
      await render(<StrokeIcon stroke="FR" size={size} variant="empty" />);

      const ring = ringsOf()[0];
      const svg = screen.container.queryAll((node) => node.type === 'RNSVGSvgView').find((node) => node.props.width === box);
      expect(svg).toBeDefined();
      expect([svg!.props.vbWidth, svg!.props.vbHeight]).toEqual([box, box]);
      expect([ring.props.cx, ring.props.cy]).toEqual([box / 2, box / 2]);
      expect(ring.props.r).toBe((box - 1.5) / 2);
      expect([boxStyle('Libre').width, boxStyle('Libre').height]).toEqual([box, box]);
    });

    it.each(['default', 'onColor'] as const)('%s draws no dashed ring', async (variant) => {
      await render(<StrokeIcon stroke="FR" variant={variant} />);

      expect(ringsOf()).toHaveLength(0);
    });

    it.each(themes)('onColor has a 75 % white background and an on-color glyph on %s', async (theme) => {
      await render(<ThemeProvider name={theme}><StrokeIcon stroke="BR" variant="onColor" /></ThemeProvider>);

      const layers = screen.container.queryAll(
        (node) => node.props.style && StyleSheet.flatten(node.props.style).opacity === 0.75,
      );
      expect(layers).toHaveLength(1);
      expect(StyleSheet.flatten(layers[0].props.style).backgroundColor).toBe(colors[theme]['on-header']);
      expect(boxStyle('Pecho').opacity).toBeUndefined();
      expect(boxStyle('Pecho').borderRadius).toBe(radius.full);
      expect(boxStyle('Pecho').backgroundColor).toBeUndefined();
      expect(StyleSheet.flatten(layers[0].props.style).borderRadius).toBe(radius.full);
      expect(pathsOf().every((node) => inkOf(node).includes(paint(theme, 'on-color').payload))).toBe(true);
    });

    it('IM keeps its four fixed colors in the empty and onColor variants', async () => {
      await render(<><StrokeIcon stroke="IM" variant="empty" /><StrokeIcon stroke="IM" variant="onColor" /></>);

      const fills = circlesOf().filter((node) => !node.props.strokeDasharray).map((node) => node.props.fill);
      for (const start of [0, 8]) {
        expect(fills.slice(start, start + 4)).toEqual(fixedColors.map((token) => paint('light', token)));
      }
    });
  });

  describe('accessibility', () => {
    it.each(Object.entries(label))('%s is one image named %s', async (code, name) => {
      await render(<StrokeIcon stroke={code as StrokeCode} />);

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
