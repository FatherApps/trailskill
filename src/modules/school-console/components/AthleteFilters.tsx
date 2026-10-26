import { useState } from 'react';
import { Pressable, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, Tag, useFocusRing } from '../../../core/ui';
import '../i18n';
import type { AthleteFilterId } from './athleteTypes';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

export type AthleteFiltersProps<Id extends string = AthleteFilterId> = {
  query: string;
  onQueryChange: (query: string) => void;
  // The chosen value of each active filter; a missing key is an inactive chip.
  filters: Partial<Record<Id, string>>;
  // Only reports the press: the selector a chip would open is not part of this component.
  onFilterPress: (id: Id) => void;
  // The chips to show, in order. The athletes' filters when absent.
  chips?: readonly Id[];
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

const athleteChips = ['category', 'group', 'coach'] as const;

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// Gap: core TextField has no leading icon, so the search field is built here with the TextField tokens.
// Narrowest row that holds the field and the three chips side by side; it is not a token.
const MIN_INLINE_WIDTH = 560;

function SearchField({ query, onQueryChange, stacked }: Pick<AthleteFiltersProps, 'query' | 'onQueryChange'> & { stacked: boolean }) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focused, focusProps, ring } = useFocusRing();
  const scale = useTextScale();
  const label = t('schoolConsole.filters.search');
  // Large text: the full placeholder would be cut with an ellipsis, so the visible hint is the short one.
  const placeholder = scale >= LARGE_TEXT_SCALE ? t('schoolConsole.filters.searchShort') : label;

  return (
    <View
      testID="athlete-search"
      style={[
        {
          // Stacked: the field is the full-width block above the chips, so its placeholder is never cut.
          ...(stacked ? { alignSelf: 'stretch' } : { flexGrow: 1, flexBasis: 220 }),
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          minHeight: size['field-h'],
          paddingHorizontal: space[3],
          borderWidth: 1.5,
          borderRadius: radius.sm,
          borderColor: colors[focused ? athleteFiltersColors.focus : athleteFiltersColors.border],
          backgroundColor: colors[athleteFiltersColors.background],
        },
        ring,
      ]}
    >
      <Icon name="search" color={athleteFiltersColors.placeholder} />
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors[athleteFiltersColors.placeholder]}
        autoCorrect={false}
        returnKeyType="search"
        {...focusProps}
        style={[
          typography.body,
          { flex: 1, alignSelf: 'stretch', paddingHorizontal: 0, paddingVertical: 0, color: colors[athleteFiltersColors.text] },
        ]}
      />
    </View>
  );
}

function FilterChip<Id extends string>({
  id,
  name,
  value,
  onPress,
}: {
  id: Id;
  name: string;
  value: string | undefined;
  onPress: (id: Id) => void;
}) {
  const { size } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const active = value !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? t('schoolConsole.filters.active_spoken', { filter: name, value }) : name}
      accessibilityState={{ selected: active }}
      onPress={() => onPress(id)}
      {...focusProps}
      // The chip is 24 dp high; the touch area is the full 48.
      style={[{ minHeight: size['target-min'], justifyContent: 'center' }, ring]}
    >
      <View {...hidden}>
        <Tag label={active ? value : name} variant={active ? 'info' : 'outline'} icon={active ? 'close' : undefined} />
      </View>
    </Pressable>
  );
}

// The search field and the filter chips. Presentational: the query and the active filters arrive by props.
export function AthleteFilters<Id extends string = AthleteFilterId>({ query, onQueryChange, filters, onFilterPress, chips: chipIds = athleteChips as unknown as readonly Id[] }: AthleteFiltersProps<Id>) {
  const { space } = useTheme();
  const scale = useTextScale();
  const [width, setWidth] = useState<number | null>(null);
  const stacked = scale >= LARGE_TEXT_SCALE || (width !== null && width < MIN_INLINE_WIDTH);

  const chips = chipIds.map((id) => {
    const name = t(`schoolConsole.filters.${id}`);
    const value = filters[id];
    return <FilterChip key={id} id={id} name={name} value={value} onPress={onFilterPress} />;
  });
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const search = <SearchField query={query} onQueryChange={onQueryChange} stacked={stacked} />;

  // Stacked: two blocks in a column, the search above and the wrapping chips below.
  if (stacked) {
    return (
      <View testID="athlete-filters" onLayout={onLayout} style={{ flexDirection: 'column', alignSelf: 'stretch', gap: space[2] }}>
        {search}
        <View testID="athlete-chips" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
          {chips}
        </View>
      </View>
    );
  }

  return (
    <View testID="athlete-filters" onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
      {search}
      {chips}
    </View>
  );
}
