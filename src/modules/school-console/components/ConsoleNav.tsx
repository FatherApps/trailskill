import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, Logo, type IconName, useFocusRing } from '../../../core/ui';
import '../i18n';

export type ConsoleDestinationId = 'athletes' | 'coaches' | 'records' | 'measurements' | 'authorizations' | 'settings';

// The six console destinations, in the order of the design-system reference.
export const consoleDestinations: readonly { id: ConsoleDestinationId; icon: IconName }[] = [
  { id: 'athletes', icon: 'group' },
  { id: 'coaches', icon: 'sports' },
  { id: 'records', icon: 'leaderboard' },
  { id: 'measurements', icon: 'timer' },
  { id: 'authorizations', icon: 'shield_person' },
  { id: 'settings', icon: 'settings' },
];

export type ConsoleNavProps = {
  // Side: the expanded layout. Top: the medium layout.
  variant: 'side' | 'top';
  activeId: ConsoleDestinationId;
  onSelect: (id: ConsoleDestinationId) => void;
  // Passed by the caller, shown under the logo.
  schoolName: string;
};

export const consoleNavColors: {
  panel: ColorToken;
  border: ColorToken;
  caption: ColorToken;
  inactive: ColorToken;
  active: { background: ColorToken; text: ColorToken };
} = {
  panel: 'surface-1',
  border: 'border',
  caption: 'ink-muted',
  inactive: 'ink',
  active: { background: 'primary', text: 'on-primary' },
};

// Width of the side navigation in the design-system reference; it is not a token.
const SIDE_WIDTH = 240;

// One tab: its own component so each keeps its focus state.
function NavTab({
  id,
  icon,
  selected,
  onSelect,
}: {
  id: ConsoleDestinationId;
  icon: IconName;
  selected: boolean;
  onSelect: (id: ConsoleDestinationId) => void;
}) {
  const { space, radius, size, typography, colors } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const textColor = selected ? consoleNavColors.active.text : consoleNavColors.inactive;
  const label = t(`schoolConsole.nav.${id}`);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => onSelect(id)}
      {...focusProps}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: size['target-min'],
          paddingHorizontal: space[4],
          borderRadius: radius.full,
          backgroundColor: selected ? colors[consoleNavColors.active.background] : 'transparent',
        },
        ring,
      ]}
    >
      <Icon name={icon} color={textColor} />
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[selected ? typography['body-strong'] : typography.body, { flexShrink: 1, color: colors[textColor] }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ConsoleNav({ variant, activeId, onSelect, schoolName }: ConsoleNavProps) {
  const { colors, space, typography } = useTheme();
  const side = variant === 'side';

  const brand = (
    <View style={{ gap: space[2], paddingBottom: space[3], paddingHorizontal: space[2] }}>
      {/* Lockup 30 dp high, then the school name 8 dp below, both 8 dp in from the panel padding (LInvitarEntrenador, LMarcasEscuela). */}
      <View style={{ alignSelf: 'flex-start' }}>
        <Logo height={30} />
      </View>
      <Text style={[typography.caption, { color: colors[consoleNavColors.caption] }]}>{schoolName}</Text>
    </View>
  );

  return (
    <View
      testID={side ? 'console-nav-side' : 'console-nav-top'}
      style={[
        {
          backgroundColor: colors[consoleNavColors.panel],
          borderColor: colors[consoleNavColors.border],
          gap: space[2],
          padding: space[4],
        },
        side
          ? { width: SIDE_WIDTH, borderRightWidth: 1, paddingHorizontal: space[3] }
          : { alignSelf: 'stretch', borderBottomWidth: 1 },
      ]}
    >
      {brand}
      <View
        testID="console-nav-tabs"
        accessibilityRole="tablist"
        accessibilityLabel={t('schoolConsole.nav.label')}
        style={side ? { flexDirection: 'column', gap: space[1] } : { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}
      >
        {consoleDestinations.map(({ id, icon }) => (
          <NavTab key={id} id={id} icon={icon} selected={id === activeId} onSelect={onSelect} />
        ))}
      </View>
    </View>
  );
}
