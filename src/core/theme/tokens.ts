// Transcribed from the TrailSkill design system, version 1792879026-78a3 (tokens.json; see design/README.md).
// Aliases such as {coral} are resolved to concrete values here. Do not edit values by hand: change the design system first.

export type ThemeName = 'light' | 'dark';

export type ColorToken =
  | 'surface-0'
  | 'surface-1'
  | 'surface-2'
  | 'ink'
  | 'ink-muted'
  | 'border'
  | 'border-strong'
  | 'primary'
  | 'on-primary'
  | 'primary-tint'
  | 'on-primary-tint'
  | 'action'
  | 'on-action'
  | 'header'
  | 'on-header'
  | 'on-header-muted'
  | 'lime'
  | 'coral'
  | 'lilac'
  | 'sky'
  | 'on-color'
  | 'stop'
  | 'on-stop'
  | 'warning'
  | 'danger-text'
  | 'danger-bg'
  | 'warning-text'
  | 'warning-bg'
  | 'success'
  | 'on-success'
  | 'success-bg'
  | 'focus'
  | 'focus-on-header'
  | 'trail'
  | 'athlete-1'
  | 'athlete-2'
  | 'athlete-3'
  | 'athlete-4'
  | 'scrim'
  | 'card-ring'
  | 'viz-series-1'
  | 'viz-series-2'
  | 'viz-best'
  | 'viz-grid'
  | 'viz-axis'
  | 'viz-reserved';

export const colors: Record<ThemeName, Record<ColorToken, string>> = {
  light: {
    'surface-0': '#F4F2EC',
    'surface-1': '#FFFFFF',
    'surface-2': '#ECE9E0',
    ink: '#141414',
    'ink-muted': '#55524A',
    border: '#E3DFD4',
    'border-strong': '#86817A',
    primary: '#141414',
    'on-primary': '#FFFFFF',
    'primary-tint': '#EEE9FE',
    'on-primary-tint': '#141414',
    action: '#C8EF55',
    'on-action': '#141414',
    header: '#141414',
    'on-header': '#FFFFFF',
    'on-header-muted': '#B8A6F8',
    lime: '#C8EF55',
    coral: '#FF5E45',
    lilac: '#B8A6F8',
    sky: '#4CC3F0',
    'on-color': '#141414',
    stop: '#141414',
    'on-stop': '#FFFFFF',
    warning: '#7A4E00',
    'danger-text': '#B3122B',
    'danger-bg': '#FDE8E5',
    'warning-text': '#7A4E00',
    'warning-bg': '#FFF3D1',
    success: '#0B6B3A',
    'on-success': '#FFFFFF',
    'success-bg': '#DDF4E7',
    focus: '#3355FF',
    'focus-on-header': '#C8EF55',
    trail: '#FF5E45',
    'athlete-1': '#B8A6F8',
    'athlete-2': '#FF5E45',
    'athlete-3': '#4CC3F0',
    'athlete-4': '#C8EF55',
    scrim: 'rgba(20, 20, 20, 0.5)',
    'card-ring': 'rgba(255, 255, 255, 0.44)',
    'viz-series-1': '#141414',
    'viz-series-2': '#1A7FAB',
    'viz-best': '#D93A22',
    'viz-grid': '#E6E2D8',
    'viz-axis': '#55524A',
    'viz-reserved': '#ECE9E0',
  },
  dark: {
    'surface-0': '#121210',
    'surface-1': '#1C1C19',
    'surface-2': '#2A2925',
    ink: '#F4F2EC',
    'ink-muted': '#B5B0A3',
    border: '#34332E',
    'border-strong': '#7A766C',
    primary: '#F4F2EC',
    'on-primary': '#141414',
    'primary-tint': '#2E2843',
    'on-primary-tint': '#E4DCFF',
    action: '#C8EF55',
    'on-action': '#141414',
    header: '#0A0A09',
    'on-header': '#FFFFFF',
    'on-header-muted': '#B8A6F8',
    lime: '#C8EF55',
    coral: '#FF5E45',
    lilac: '#B8A6F8',
    sky: '#4CC3F0',
    'on-color': '#141414',
    stop: '#F4F2EC',
    'on-stop': '#141414',
    warning: '#FFD27A',
    'danger-text': '#FF9DAA',
    'danger-bg': '#3D1714',
    'warning-text': '#FFD27A',
    'warning-bg': '#3B2E08',
    success: '#7BDCA5',
    'on-success': '#04210F',
    'success-bg': '#123323',
    focus: '#9DB0FF',
    'focus-on-header': '#C8EF55',
    trail: '#FF5E45',
    'athlete-1': '#B8A6F8',
    'athlete-2': '#FF5E45',
    'athlete-3': '#4CC3F0',
    'athlete-4': '#C8EF55',
    scrim: 'rgba(0, 0, 0, 0.64)',
    'card-ring': 'rgba(255, 255, 255, 0.44)',
    'viz-series-1': '#F4F2EC',
    'viz-series-2': '#4CC3F0',
    'viz-best': '#FF7A63',
    'viz-grid': '#2E2D28',
    'viz-axis': '#B5B0A3',
    'viz-reserved': '#2A2925',
  },
};

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 18,
  5: 20,
  6: 24,
  8: 32,
  12: 52,
} as const;

export const radius = {
  sm: 12,
  md: 24,
  lg: 32,
  full: 999,
} as const;

export const size = {
  'target-min': 48,
  'target-timing': 88,
  'icon-md': 22,
  'icon-sm': 16,
  'field-h': 52,
} as const;

// Layout breakpoints (minimum width in dp) from the design system.
export const breakpoint = {
  'bp-compact': 0, // Phone: one column.
  'bp-medium': 600, // Tablet portrait.
  'bp-expanded': 1024, // Tablet landscape and desktop: side navigation + content + detail.
} as const;

export type Elevation = {
  elevation: number;
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
};

export type ElevationToken = 'elevation-1';

// elevation-1 is `0 8px 24px rgba(20, 20, 20, 0.16)` (light) and `0 8px 24px rgba(0, 0, 0, 0.6)` (dark);
// the RN handoff maps it to Android `elevation: 2`. The alpha lives in shadowOpacity, so shadowColor is opaque.
export const elevation: Record<ThemeName, Record<ElevationToken, Elevation>> = {
  light: {
    'elevation-1': {
      elevation: 2,
      shadowColor: 'rgb(20, 20, 20)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
    },
  },
  dark: {
    'elevation-1': {
      elevation: 2,
      shadowColor: 'rgb(0, 0, 0)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.6,
      shadowRadius: 24,
    },
  },
};

export const fontFamily = {
  display: 'BricolageGrotesque_800ExtraBold',
  sansRegular: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

export type TextStyleToken =
  | 'display-xl'
  | 'title-lg'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'body-strong'
  | 'label'
  | 'caption'
  | 'time-display'
  | 'time-lg'
  | 'time-md'
  | 'time-sm';

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '800';
  letterSpacing?: number;
};

// letterSpacing is the design-system em value multiplied by fontSize (dp).
export const typography: Record<TextStyleToken, TextStyle> = {
  'display-xl': {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.32,
  },
  'title-lg': {
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.96,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.44,
  },
  subtitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  body: {
    fontFamily: fontFamily.sansRegular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  'body-strong': {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  label: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontFamily: fontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  'time-display': {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 72,
    lineHeight: 80,
    fontWeight: '600',
    letterSpacing: -1.44,
  },
  'time-lg': {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '600',
  },
  'time-md': {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  'time-sm': {
    fontFamily: fontFamily.monoMedium,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
};
