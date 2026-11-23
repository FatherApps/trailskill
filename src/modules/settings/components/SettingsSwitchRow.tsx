import { Pressable, Text, View } from 'react-native';

import { darken, useTheme, type ColorToken } from '../../../core/theme';
import { Icon, useFocusRing, type IconName } from '../../../core/ui';

export type SettingsSwitchRowProps = {
  icon: IconName;
  label: string;
  /** The explanation under the name, the same text the setting always had. */
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

// Every value is an existing token: the design system has no switch yet, so this one is built from the Segmented and card tokens.
export const settingsSwitchColors: {
  card: ColorToken;
  cardBorder: ColorToken;
  iconBackground: ColorToken;
  on: { track: ColorToken; thumb: ColorToken };
  off: { track: ColorToken; border: ColorToken; thumb: ColorToken };
} = {
  card: 'surface-1',
  cardBorder: 'border',
  iconBackground: 'surface-2',
  on: { track: 'primary', thumb: 'on-primary' },
  // The off track carries a border-strong edge so the control keeps 3:1 against the card; the thumb's side tells the state, not colour alone.
  off: { track: 'surface-2', border: 'border-strong', thumb: 'surface-1' },
};

// A yes/no setting as one row: icon, name and explanation, and the switch on the right. The whole row is the switch.
export function SettingsSwitchRow({ icon, label, hint, value, onChange }: SettingsSwitchRowProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const thumb = size['avatar-sm'];
  const pad = space[1];
  const border = 1.5;
  const state = value ? settingsSwitchColors.on : settingsSwitchColors.off;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      {...focusProps}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: size['target-min'],
          padding: space[4],
          borderRadius: radius.md,
          borderWidth: border,
          borderColor: colors[settingsSwitchColors.cardBorder],
          backgroundColor: pressed ? darken(colors[settingsSwitchColors.card], 0.04) : colors[settingsSwitchColors.card],
        },
        ring,
      ]}
    >
      <View
        style={{
          width: size['avatar-md'],
          height: size['avatar-md'],
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors[settingsSwitchColors.iconBackground],
        }}
      >
        <Icon name={icon} />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text style={[typography['body-strong'], { color: colors.ink }]}>{label}</Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{hint}</Text>
      </View>
      <View
        style={{
          width: thumb * 2 + pad * 2 + border * 2,
          height: thumb + pad * 2 + border * 2,
          padding: pad,
          borderRadius: radius.full,
          borderWidth: border,
          borderColor: value ? colors[settingsSwitchColors.on.track] : colors[settingsSwitchColors.off.border],
          backgroundColor: colors[state.track],
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View style={{ width: thumb, height: thumb, borderRadius: radius.full, backgroundColor: colors[state.thumb] }} />
      </View>
    </Pressable>
  );
}
