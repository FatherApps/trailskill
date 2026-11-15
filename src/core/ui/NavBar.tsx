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
  /**
   * Where the active item's name shows: inside its pill (the design), or under the bar, with every item as an icon only.
   * "below" is for a bar with more items than fit with a name inside (issue 999); its items take the minimum touch target.
   */
  labelPlacement?: 'inside' | 'below';
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
export function NavBar({ items, activeId, onSelect, labelPlacement = 'inside' }: NavBarProps) {
  const below = labelPlacement === 'below';
  const active = items.find((item) => item.id === activeId);
  const { colors, space, radius, size, typography, elevation } = useTheme();
  // "below" floats over the screen, inside the root layout that already keeps clear of the system bar: no second inset.
  const Frame = below ? View : SafeAreaView;

  return (
    // The native view pads only the part that overlaps the system bar, so it does not double the root layout's padding.
    <Frame
      {...(below ? {} : { edges: ['bottom'] as const })}
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
            marginBottom: below ? space[1] : space[4],
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
                flexShrink: selected && !below ? 1 : 0,
                gap: space[2],
                minHeight: size['target-min'],
                // 52 is the design-system reference width of an icon-only item; it is not a token.
                minWidth: below ? size['target-min'] : 52,
                paddingHorizontal: below ? 0 : space[3],
                borderRadius: radius.full,
                backgroundColor: selected ? colors[navBarColors.active.background] : 'transparent',
              }}
            >
              <Icon name={item.icon} color={color} />
              {selected && !below && (
                <Text style={[typography.label, { flexShrink: 1, color: colors[color] }]}>{item.label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {below && active && (
        // Read by the selected tab already: hidden from screen readers so it is not said twice.
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          // Over the screen's content, so it sits on the bar's own surface to stay readable.
          style={[
            typography.label,
            {
              marginBottom: space[2],
              paddingHorizontal: space[3],
              borderRadius: radius.full,
              overflow: 'hidden',
              color: colors.ink,
              backgroundColor: colors[navBarColors.bar],
            },
          ]}
        >
          {active.label}
        </Text>
      )}
    </Frame>
  );
}
