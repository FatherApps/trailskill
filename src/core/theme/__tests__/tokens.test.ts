import { contrastRatio } from '../contrast';
import { breakpoint, colors, type ThemeName } from '../tokens';

const themes: ThemeName[] = ['light', 'dark'];

describe('color tokens', () => {
  it('match the design system values', () => {
    expect(colors.light.action).toBe('#C8EF55');
    expect(colors.light['surface-0']).toBe('#F4F2EC');
    expect(colors.dark['surface-0']).toBe('#121210');
    expect(colors.light.ink).toBe('#141414');
  });

  it('resolve aliases to concrete values', () => {
    expect(colors.dark.warning).toBe(colors.dark['warning-text']);
    expect(colors.light.trail).toBe(colors.light.coral);
    expect(colors.dark['viz-series-1']).toBe(colors.dark.primary);
    expect(colors.light['viz-reserved']).toBe(colors.light['surface-2']);
  });

  it.each(themes)('%s theme has no alias left and the same names as the other theme', (theme) => {
    expect(Object.keys(colors[theme]).sort()).toEqual(Object.keys(colors.light).sort());
    for (const value of Object.values(colors[theme])) {
      expect(value).not.toMatch(/[{}]/);
    }
  });

  it.each(themes)('%s theme meets 4.5:1 for the core text pairs', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c.ink, c['surface-0'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c['ink-muted'], c['surface-1'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c['on-action'], c.action)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('is symmetric and 1 for equal colors', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#C8EF55', '#C8EF55')).toBeCloseTo(1, 2);
  });
});

describe('breakpoint tokens', () => {
  it('matches the design system layout breakpoints', () => {
    expect(breakpoint).toEqual({ 'bp-compact': 0, 'bp-medium': 600, 'bp-expanded': 1024 });
  });
});
