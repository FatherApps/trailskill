import { useState } from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';

import { ringGapColor, size as sizeTokens, useTheme, type ColorToken, type TextStyleToken } from '../theme';

export type AthleteAvatarSize = 'sm' | 'md' | 'lg';

export type AthleteAvatarProps = {
  initials: string;
  // The athlete's colour, 1 to 4 (athlete-1 to athlete-4). Absent for something that is not an athlete yet (for example an
  // unassigned position): neutral surface-2 circle, no ring.
  colorIndex?: 1 | 2 | 3 | 4;
  size: AthleteAvatarSize;
  photoUri?: string;
  // The "Mostrar la foto" authorization. Without it the photo is never loaded, whatever `photoUri` says.
  authorized: boolean;
};

export const athleteAvatarColors: { initials: ColorToken; neutralBackground: ColorToken; neutralInitials: ColorToken } = {
  initials: 'on-color',
  neutralBackground: 'surface-2',
  neutralInitials: 'ink',
};

// The initials' text style and the padding that must fit around its line at the OS text scale. `md` is the SwimmerRow
// formula and `sm` the one of the chip dot, both from before this component; `lg` follows the same rule with `title`.
const initialsStyle: Record<AthleteAvatarSize, { text: TextStyleToken; padding: 1 | 2 }> = {
  sm: { text: 'caption', padding: 1 },
  md: { text: 'label', padding: 2 },
  lg: { text: 'title', padding: 2 },
};

// The circle's side in dp. The OS text scale grows Text but is not in the theme tokens, so the circle grows with it and the
// initials stay inside. Also what a row needs to lay out around the avatar.
export function useAthleteAvatarSize(size: AthleteAvatarSize): number {
  const { space, typography } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { text, padding } = initialsStyle[size];
  return Math.max(sizeTokens[`avatar-${size}`], Math.ceil(typography[text].lineHeight * fontScale) + 2 * space[padding]);
}

// Hidden from screen readers: the athlete's name is always next to it and is what gets read.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// Where the photo of `uri` stands: no result yet while it loads. Keyed by uri so a new photo starts again from the initials.
type PhotoResult = { uri: string; loaded: boolean };

export function AthleteAvatar({ initials, colorIndex, size, photoUri, authorized }: AthleteAvatarProps) {
  const { colors, radius, typography } = useTheme();
  const side = useAthleteAvatarSize(size);
  const [result, setResult] = useState<PhotoResult | null>(null);

  const color: ColorToken | null = colorIndex ? `athlete-${colorIndex}` : null;
  const current = result?.uri === photoUri ? result : null;
  const showPhoto = Boolean(photoUri) && authorized && current?.loaded !== false;
  const loaded = showPhoto && current?.loaded === true;
  const outset = sizeTokens['ring-gap'] + sizeTokens['ring-athlete'];

  return (
    <View testID="athlete-avatar" {...hidden} style={{ width: side, height: side }}>
      {color && (
        // Drawn outside the layout box, like the design system's box-shadow: the avatar takes the same room with or without it.
        <View
          testID="athlete-avatar-ring"
          style={{
            position: 'absolute',
            top: -outset,
            right: -outset,
            bottom: -outset,
            left: -outset,
            borderRadius: radius.full,
            borderWidth: sizeTokens['ring-athlete'],
            borderColor: colors[color],
            backgroundColor: ringGapColor,
          }}
        />
      )}
      <View
        style={{
          width: side,
          height: side,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: radius.full,
          backgroundColor: colors[color ?? athleteAvatarColors.neutralBackground],
        }}
      >
        {!loaded && (
          <Text style={[typography[initialsStyle[size].text], { color: colors[color ? athleteAvatarColors.initials : athleteAvatarColors.neutralInitials] }]}>
            {initials}
          </Text>
        )}
        {showPhoto && photoUri && (
          <Image
            testID="athlete-avatar-photo"
            source={{ uri: photoUri }}
            resizeMode="cover"
            onLoad={() => setResult({ uri: photoUri, loaded: true })}
            onError={() => setResult({ uri: photoUri, loaded: false })}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
        )}
      </View>
    </View>
  );
}
