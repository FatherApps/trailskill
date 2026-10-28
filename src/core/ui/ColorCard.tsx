import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { radius as radii, space as spaces, useTheme, type ColorToken } from '../theme';

// An athlete token or a brand token; the phase colours are the brand tokens too (which phase takes which is still open).
export type ColorCardColor = 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4' | 'lime' | 'coral' | 'lilac' | 'sky';

// The decorative circles of a hero card: a translucent ring, a dot and, optionally, a small accent dot. Colours are brand tokens.
export type ColorCardDecoration = { dot: ColorCardColor; accent?: ColorCardColor };

export type ColorCardProps = {
  color: ColorCardColor;
  title: string;
  detail?: string;
  decoration?: ColorCardDecoration;
  children?: ReactNode;
};

export const colorCardColors: { text: ColorToken; ring: ColorToken } = { text: 'on-color', ring: 'card-ring' };

// Sizes and offsets are space and radius tokens; the circles are placed from the right edge so they hold on any card width.
const ring = { size: spaces[12] * 4, width: spaces[5], top: -spaces[8], right: -spaces[6] };
const dot = { size: spaces[12], top: spaces[6], right: spaces[6] };
const accent = { size: spaces[6], top: spaces[12] + spaces[6], right: spaces[12] + spaces[8] };

// Measured from the reference screen: the decorated card is about 5 x space[12] tall and its text sits at the bottom, below the circles.
const decorated = { overflow: 'hidden', minHeight: spaces[12] * 5, justifyContent: 'flex-end' } as const;

const hidden = {
  accessible: false,
  importantForAccessibility: 'no-hide-descendants',
  accessibilityElementsHidden: true,
  pointerEvents: 'none',
} as const;

export function ColorCard({ color, title, detail, decoration, children }: ColorCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const text = { color: colors[colorCardColors.text] };
  const circle = (size: number, top: number, right: number) =>
    ({ position: 'absolute', width: size, height: size, borderRadius: radii.full, top, right }) as const;

  return (
    <View
      style={{
        gap: space[1],
        padding: space[4],
        borderRadius: radius.md,
        backgroundColor: colors[color],
        ...(decoration && decorated),
      }}
    >
      {decoration && (
        <View testID="color-card-decoration" {...hidden} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <View
            testID="color-card-ring"
            style={[circle(ring.size, ring.top, ring.right), { borderWidth: ring.width, borderColor: colors[colorCardColors.ring] }]}
          />
          <View testID="color-card-dot" style={[circle(dot.size, dot.top, dot.right), { backgroundColor: colors[decoration.dot] }]} />
          {decoration.accent && (
            <View
              testID="color-card-accent"
              style={[circle(accent.size, accent.top, accent.right), { backgroundColor: colors[decoration.accent] }]}
            />
          )}
        </View>
      )}
      <Text style={[typography.title, text]}>{title}</Text>
      {detail ? <Text style={[typography.caption, text]}>{detail}</Text> : null}
      {children}
    </View>
  );
}
