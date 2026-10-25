import { useState } from 'react';
import { Pressable, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, Tag } from '../../../core/ui';
import '../i18n';
import type { AthleteFilterId } from './athleteTypes';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

export type AthleteFiltersProps = {
  query: string;
  onQueryChange: (query: string) => void;
  // The chosen value of each active filter; a missing key is an inactive chip.
  filters: Partial<Record<AthleteFilterId, string>>;
  // Only reports the press: the selector a chip would open is not part of this component.
  onFilterPress: (id: AthleteFilterId) => void;
};

export const athleteFiltersColors: {
  background: ColorToken;
  border: ColorToken;
  focus: ColorToken;
  text: ColorToken;
  placeholder: ColorToken;
} = {
  background: 'surface-1',
  border: 'border-strong',
  focus: 'focus',
  text: 'ink',
  placeholder: 'ink-muted',
};

const filterIds: AthleteFilterId[] = ['category', 'group', 'coach'];

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// Gap: core TextField has no leading icon, so the search field is built here with the TextField tokens.
// Narrowest row that holds the field and the three chips side by side; it is not a token.
const MIN_INLINE_WIDTH = 560;

function SearchField({ query, onQueryChange, stacked }: Pick<AthleteFiltersProps, 'query' | 'onQueryChange'> & { stacked: boolean }) {
  const { colors, space, radius, size, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const label = t('schoolConsole.filters.search');

  return (
    <View
      testID="athlete-search"
      style={{
        flexGrow: 1,
        // Stacked: the field takes the whole row, so its placeholder is never cut.
        flexBasis: stacked ? '100%' : 220,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: size['field-h'],
        paddingHorizontal: space[3],
        borderWidth: 1.5,
        borderRadius: radius.sm,
        borderColor: colors[focused ? athleteFiltersColors.focus : athleteFiltersColors.border],
        backgroundColor: colors[athleteFiltersColors.background],
      }}
    >
      <Icon name="search" color={athleteFiltersColors.placeholder} />
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors[athleteFiltersColors.placeholder]}
        autoCorrect={false}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          typography.body,
          { flex: 1, alignSelf: 'stretch', paddingHorizontal: 0, paddingVertical: 0, color: colors[athleteFiltersColors.text] },
        ]}
      />
    </View>
  );
}

// The search field and the filter chips. Presentational: the query and the active filters arrive by props.
export function AthleteFilters({ query, onQueryChange, filters, onFilterPress }: AthleteFiltersProps) {
  const { space, size } = useTheme();
  const scale = useTextScale();
  const [width, setWidth] = useState<number | null>(null);
  const stacked = scale >= LARGE_TEXT_SCALE || (width !== null && width < MIN_INLINE_WIDTH);

  return (
    <View
      testID="athlete-filters"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}
    >
      <SearchField query={query} onQueryChange={onQueryChange} stacked={stacked} />
      {filterIds.map((id) => {
        const name = t(`schoolConsole.filters.${id}`);
        const value = filters[id];
        const active = value !== undefined;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={active ? t('schoolConsole.filters.active_spoken', { filter: name, value }) : name}
            accessibilityState={{ selected: active }}
            onPress={() => onFilterPress(id)}
            // The chip is 24 dp high; the touch area is the full 48.
            style={{ minHeight: size['target-min'], justifyContent: 'center' }}
          >
            <View {...hidden}>
              <Tag label={active ? value : name} variant={active ? 'info' : 'outline'} icon={active ? 'close' : undefined} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
