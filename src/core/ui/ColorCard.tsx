import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme, type ColorToken } from '../theme';

// An athlete token or a brand token; the phase colours are the brand tokens too (which phase takes which is still open).
export type ColorCardColor = 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4' | 'lime' | 'coral' | 'lilac' | 'sky';

export type ColorCardProps = {
  color: ColorCardColor;
  title: string;
  detail?: string;
  children?: ReactNode;
};

export const colorCardColors: { text: ColorToken } = { text: 'on-color' };

export function ColorCard({ color, title, detail, children }: ColorCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const text = { color: colors[colorCardColors.text] };

  return (
    <View style={{ gap: space[1], padding: space[4], borderRadius: radius.md, backgroundColor: colors[color] }}>
      <Text style={[typography.title, text]}>{title}</Text>
      {detail ? <Text style={[typography.caption, text]}>{detail}</Text> : null}
      {children}
    </View>
  );
}
