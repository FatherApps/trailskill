import { Pressable } from 'react-native';

import { t } from '../i18n';
import { useTheme, type ColorToken } from '../theme';
import { useFocusRing } from './focusRing';
import { Icon } from './Icon';

export type BackButtonProps = {
  onPress: () => void;
};

export const backButtonColors: { background: ColorToken; icon: ColorToken } = {
  background: 'surface-1',
  icon: 'ink',
};

// The one Back control of the app (design system: "a round back button"): a surface-1 circle with the arrow_back icon, in the leftmost slot of the
// top bar. A screen that is the root of its role (nowhere to go back to) does not draw it. The label is the shared `common.back` key.
export function BackButton({ onPress }: BackButtonProps) {
  const { colors, radius, size } = useTheme();
  const { focusProps, ring } = useFocusRing();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={onPress}
      {...focusProps}
      style={[
        {
          // minWidth equal to maxWidth acts as a fixed width without `width`, which the rules tests forbid on controls: a column with stretched children
          // cannot widen the circle, and a row still centres it through the parent's alignItems (no alignSelf).
          minWidth: size['target-min'],
          maxWidth: size['target-min'],
          minHeight: size['target-min'],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: colors[backButtonColors.background],
        },
        ring,
      ]}
    >
      <Icon name="arrow_back" color={backButtonColors.icon} />
    </Pressable>
  );
}
