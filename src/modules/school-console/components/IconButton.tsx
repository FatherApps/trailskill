import type { ComponentRef, Ref } from 'react';
import { Pressable } from 'react-native';

import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, type IconName } from '../../../core/ui';

export type IconButtonProps = {
  icon: IconName;
  // The icon is decorative: this label is the button's name.
  label: string;
  onPress: () => void;
  ref?: Ref<ComponentRef<typeof Pressable>>;
};

export const iconButtonColors: { background: ColorToken; icon: ColorToken } = {
  background: 'surface-2',
  icon: 'ink',
};

// A round icon-only button (close, back) with the 48 dp touch target.
export function IconButton({ icon, label, onPress, ref }: IconButtonProps) {
  const { colors, radius, size } = useTheme();

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: size['target-min'],
        height: size['target-min'],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: colors[iconButtonColors.background],
      }}
    >
      <Icon name={icon} color={iconButtonColors.icon} />
    </Pressable>
  );
}
