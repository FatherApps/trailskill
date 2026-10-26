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
};

export const colorHeaderColors: { text: ColorToken; backButton: ColorToken; backIcon: ColorToken } = {
  text: 'on-color',
  backButton: 'surface-1',
  backIcon: 'ink',
};

export function ColorHeader({ color, title, subtitle, onBack, children }: ColorHeaderProps) {
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
      <Text accessibilityRole="header" style={[typography['title-lg'], text]}>
        {title}
      </Text>
      {subtitle && <Text style={[typography.body, text]}>{subtitle}</Text>}
      {children}
    </View>
  );
}
