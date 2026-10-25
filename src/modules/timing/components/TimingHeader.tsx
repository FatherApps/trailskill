import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Icon } from '../../../core/ui';
import '../i18n';

export type TimingHeaderProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  // For example a sync pill; the header does not know what it is.
  trailing?: ReactNode;
};

export function TimingHeader({ title, subtitle, onBack, trailing }: TimingHeaderProps) {
  const { colors, space, radius, size, typography } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingTop: space[4],
        paddingHorizontal: space[4],
        paddingBottom: space[2],
        backgroundColor: colors['surface-0'],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        style={{
          minWidth: size['target-min'],
          minHeight: size['target-min'],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: colors['surface-1'],
        }}
      >
        <Icon name="arrow_back" />
      </Pressable>
      {/* minWidth 0 lets a long title wrap inside the row instead of pushing the trailing slot out. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{subtitle}</Text>
        )}
      </View>
      {trailing}
    </View>
  );
}
