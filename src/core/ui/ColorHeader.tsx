import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { t } from '../i18n';
import { useTheme, type ColorToken } from '../theme';
import type { ColorCardColor } from './ColorCard';
import { useFocusRing } from './focusRing';
import { Icon } from './Icon';

export type ColorHeaderProps = {
  color: ColorCardColor;
  title: string;
  subtitle?: string;
  // Back is always on screen: the flow never depends on the system back button.
  onBack: () => void;
  // Below the title, for example a ChipRow.
  children?: ReactNode;
  // Decoration behind the whole band (back button and title included); it takes no layout and screen readers skip it.
  background?: ReactNode;
};

export const colorHeaderColors: { text: ColorToken; backButton: ColorToken; backIcon: ColorToken } = {
  text: 'on-color',
  backButton: 'surface-1',
  backIcon: 'ink',
};

export function ColorHeader({ color, title, subtitle, onBack, children, background }: ColorHeaderProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const text = { color: colors[colorHeaderColors.text] };

  return (
    <View
      style={{
        gap: space[3],
        paddingHorizontal: space[4],
        paddingTop: space[4],
        paddingBottom: space[5],
        borderBottomLeftRadius: radius.lg,
        borderBottomRightRadius: radius.lg,
        backgroundColor: colors[color],
      }}
    >
      {/* First child, so it paints behind the rest; clipped to the band's rounded bottom corners. */}
      {background ? (
        <View
          testID="color-header-background"
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            borderBottomLeftRadius: radius.lg,
            borderBottomRightRadius: radius.lg,
          }}
        >
          {background}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        {...focusProps}
        style={[
          {
            alignSelf: 'flex-start',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: size['target-min'],
            minHeight: size['target-min'],
            borderRadius: radius.full,
            backgroundColor: colors[colorHeaderColors.backButton],
          },
          ring,
        ]}
      >
        <Icon name="arrow_back" color={colorHeaderColors.backIcon} />
      </Pressable>
      {/* An empty title keeps its Text so the band layout does not move; only the header role goes, so TalkBack announces no empty heading. */}
      <Text accessibilityRole={title ? 'header' : undefined} style={[typography['title-lg'], text]}>
        {title}
      </Text>
      {subtitle ? <Text style={[typography.body, text]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}
