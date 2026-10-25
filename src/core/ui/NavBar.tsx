import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type ColorToken } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type NavBarItem = { id: string; label: string; icon: IconName };

export type NavBarProps = {
  items: NavBarItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export const navBarColors: {
  bar: ColorToken;
  inactive: ColorToken;
  active: { background: ColorToken; text: ColorToken };
} = {
  bar: 'surface-1',
  inactive: 'ink-muted',
  active: { background: 'primary', text: 'on-primary' },
};

// Phone navigation: a floating pill. The tablet navigation belongs to the school console.
export function NavBar({ items, activeId, onSelect }: NavBarProps) {
  const { colors, space, radius, size, typography, elevation } = useTheme();

  return (
    // The native view pads only the part that overlaps the system bar, so it does not double the root layout's padding.
    <SafeAreaView
      edges={['bottom']}
      pointerEvents="box-none"
      style={{ alignItems: 'center', paddingHorizontal: space[4] }}
    >
      <View
        accessibilityRole="tablist"
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            maxWidth: '100%',
            gap: space[1],
            padding: space[1],
            marginBottom: space[4],
            borderRadius: radius.full,
            backgroundColor: colors[navBarColors.bar],
          },
          elevation['elevation-1'],
        ]}
      >
        {items.map((item) => {
          const selected = item.id === activeId;
          const color = selected ? navBarColors.active.text : navBarColors.inactive;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                // Only the active item shrinks, so its label wraps instead of pushing the bar off screen.
                flexShrink: selected ? 1 : 0,
                gap: space[2],
                minHeight: size['target-min'],
                // 52 is the design-system reference width of an icon-only item; it is not a token.
                minWidth: 52,
                paddingHorizontal: space[3],
                borderRadius: radius.full,
                backgroundColor: selected ? colors[navBarColors.active.background] : 'transparent',
              }}
            >
              <Icon name={item.icon} color={color} />
              {selected && (
                <Text style={[typography.label, { flexShrink: 1, color: colors[color] }]}>{item.label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
