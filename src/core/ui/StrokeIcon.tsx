import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { t } from '../i18n';
import { isStroke, type StrokeCode } from '../sport';
import { useTheme, type ColorToken } from '../theme';

export type StrokeIconProps = {
  // Strict on purpose: callers with a wider type filter with isStroke, and a stroke without a pictogram (kick, drills) is simply not rendered.
  stroke: StrokeCode;
  size?: 'md' | 'sm';
  // default: surface-2 circle; empty: no background and a dotted frame, for a card with no time yet;
  // onColor: 75 % white backing and an on-color glyph, over a brand-colored card.
  variant?: 'default' | 'empty' | 'onColor';
  // Hidden from screen readers when the card around it already says the stroke.
  decorative?: boolean;
};

// Box and glyph size in dp, per design system.
const sizes = { md: { box: 44, glyph: 34 }, sm: { box: 32, glyph: 24 } } as const;

// Stroke width of the empty variant's dotted ring, and the target distance between dot centers.
const RING = 1.5;
const DOT_PITCH = 4.5;
// Near-zero dash: with round caps it renders as a dot as wide as RING.
const DOT = 0.01;

// Shapes copied from assets/estilos/*.svg (viewBox 0 0 32 32); drawn in the ink color the variant picks.
const WATER = 'M3 25c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0 4.3-2 6.5 0 4.3 2 6.5 0';

type GlyphProps = { ink: string };

const Water = ({ ink }: GlyphProps) => <Path d={WATER} fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />;
const Line = ({ d, ink }: GlyphProps & { d: string }) => (
  <Path d={d} fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
);

const glyphs: Record<StrokeCode, (props: GlyphProps) => React.JSX.Element> = {
  FR: ({ ink }) => (
    <>
      <Water ink={ink} />
      <Circle cx={8} cy={17} r={2.6} fill={ink} />
      <Line d="M11 19h16" ink={ink} />
      <Line d="M12 17c2-7 8-10 13-6" ink={ink} />
    </>
  ),
  BK: ({ ink }) => (
    <>
      <Water ink={ink} />
      <Circle cx={25} cy={16.5} r={2.6} fill={ink} />
      <Line d="M5 19h17" ink={ink} />
      <Line d="M20 18.5 17 5" ink={ink} />
      <Line d="M7 19l-2.5 -3" ink={ink} />
    </>
  ),
  BR: ({ ink }) => (
    <>
      <Water ink={ink} />
      <Circle cx={16} cy={13} r={2.8} fill={ink} />
      <Line d="M13 19c-3-2-6-1.5-8 1M19 19c3-2 6-1.5 8 1" ink={ink} />
    </>
  ),
  FL: ({ ink }) => (
    <>
      <Water ink={ink} />
      <Circle cx={16} cy={15} r={2.8} fill={ink} />
      <Line d="M13.5 17C10.5 6 4.5 4 3 11M18.5 17C21.5 6 27.5 4 29 11" ink={ink} />
    </>
  ),
  // Four fixed brand colors, the same in both themes; only the outline follows the ink.
  IM: ({ ink }) => <Combined ink={ink} />,
};

const quadrants = [
  { cx: 10, cy: 10, color: 'lilac' },
  { cx: 22, cy: 10, color: 'coral' },
  { cx: 10, cy: 22, color: 'sky' },
  { cx: 22, cy: 22, color: 'lime' },
] as const;

function Combined({ ink }: GlyphProps) {
  const { colors } = useTheme();

  return (
    <>
      {quadrants.map(({ cx, cy, color }) => (
        <Circle key={color} cx={cx} cy={cy} r={5} fill={colors[color]} />
      ))}
      {quadrants.map(({ cx, cy, color }) => (
        <Circle key={color} cx={cx} cy={cy} r={5} fill="none" stroke={ink} strokeWidth={1.5} />
      ))}
    </>
  );
}

// Screen-reader props: one image named after the stroke, or nothing when the card already says it.
const a11y = (decorative: boolean | undefined, label: string) =>
  decorative
    ? ({ accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const)
    : ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const);

export function StrokeIcon({ stroke, size = 'md', variant = 'default', decorative }: StrokeIconProps) {
  const { colors, radius } = useTheme();
  // Defense for values that slip through at runtime; the type already rules them out.
  if (!isStroke(stroke)) return null;

  const { box, glyph } = sizes[size];
  const inkToken: ColorToken = variant === 'empty' ? 'ink-muted' : variant === 'onColor' ? 'on-color' : 'ink';
  const Glyph = glyphs[stroke];
  const ringRadius = (box - RING) / 2;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <View
      {...a11y(decorative, t(`sport.stroke.${stroke}`))}
      style={[
        styles.box,
        { width: box, height: box, borderRadius: radius.full },
        variant === 'default' && { backgroundColor: colors['surface-2'] },
      ]}
    >
      {/* The 75 % belongs to the backing only, so the glyph stays solid. */}
      {variant === 'onColor' && (
        <View
          style={[StyleSheet.absoluteFill, { borderRadius: radius.full, backgroundColor: colors['on-header'], opacity: 0.75 }]}
        />
      )}
      {variant === 'empty' && (
        // First child so the ring sits under the glyph. Drawn in SVG because Android renders a dotted View border on a rounded view as solid or warped.
        <Svg
          style={StyleSheet.absoluteFill}
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={ringRadius}
            fill="none"
            stroke={colors['border-strong']}
            strokeWidth={RING}
            strokeDasharray={[DOT, circumference / Math.round(circumference / DOT_PITCH) - DOT]}
            strokeLinecap="round"
          />
        </Svg>
      )}
      <Svg width={glyph} height={glyph} viewBox="0 0 32 32">
        <Glyph ink={colors[inkToken]} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
