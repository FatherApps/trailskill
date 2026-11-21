import { Pressable, Text } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { chipColors, useFocusRing } from '../../../core/ui';
import '../i18n';

export type ShareCodeChipProps = {
  // The swimmer's code, for example TS-7K4Q2M.
  code: string;
  onShare: () => void;
};

// A small pill with the code and "Compartir". Presentational: the caller supplies the code and handles the press.
export function ShareCodeChip({ code, onShare }: ShareCodeChipProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('accounts.share_code.chip_label', { code })}
      onPress={onShare}
      {...focusProps}
      style={[
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: space[2],
          minHeight: size['target-min'],
          paddingHorizontal: space[3],
          borderRadius: radius.full,
          borderWidth: 1.5,
          borderColor: colors[chipColors.border],
          backgroundColor: colors[chipColors.background],
        },
        ring,
      ]}
    >
      <Text importantForAccessibility="no" accessibilityElementsHidden style={[typography.label, { color: colors[chipColors.text] }]}>
        {code}
      </Text>
      <Text importantForAccessibility="no" accessibilityElementsHidden style={[typography.caption, { color: colors['ink-muted'] }]}>
        {t('accounts.share_code.chip_action')}
      </Text>
    </Pressable>
  );
}
