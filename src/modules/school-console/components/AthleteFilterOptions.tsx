import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, StateView, useFocusRing } from '../../../core/ui';
import '../i18n';
import type { AthleteFilterId } from './athleteTypes';

export type AthleteFilterOption = { id: string; label: string | null };

export type AthleteFilterOptionsProps = {
  id: AthleteFilterId;
  // `label: null` is an option whose name is not readable yet (the coaches, until their names are available).
  options: AthleteFilterOption[];
  selectedId?: string;
  onChoose: (optionId: string) => void;
};

export const athleteFilterOptionsColors: { title: ColorToken; text: ColorToken; selected: ColorToken; check: ColorToken } = {
  title: 'ink',
  text: 'ink',
  selected: 'primary-tint',
  check: 'ink',
};

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// The label of the sheet that lists the options of a filter.
export const filterSheetLabel = (id: AthleteFilterId) => t(`schoolConsole.filters.sheet.${id}`);

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      {...focusProps}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: size['target-min'],
          paddingHorizontal: space[3],
          borderRadius: radius.sm,
          backgroundColor: selected ? colors[athleteFilterOptionsColors.selected] : undefined,
        },
        ring,
      ]}
    >
      <View {...hidden} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text style={[typography.body, { flex: 1, color: colors[athleteFilterOptionsColors.text] }]}>{label}</Text>
        {selected && <Icon name="check" color={athleteFilterOptionsColors.check} />}
      </View>
    </Pressable>
  );
}

// The body of the sheet a filter chip opens: the options to choose one from. Presentational.
export function AthleteFilterOptions({ id, options, selectedId, onChoose }: AthleteFilterOptionsProps) {
  const { colors, space, typography } = useTheme();
  const named = options.filter((option): option is { id: string; label: string } => option.label !== null);

  let body;
  if (named.length > 0) {
    body = named.map((option) => (
      <OptionRow key={option.id} label={option.label} selected={option.id === selectedId} onPress={() => onChoose(option.id)} />
    ));
  } else if (options.length > 0) {
    // Options exist but their names cannot be read: say so instead of listing blanks or ids.
    body = <StateView kind="empty" icon="group" title={t('schoolConsole.filters.sheet.coach_unavailable')} message="" />;
  } else {
    body = (
      <StateView
        kind="empty"
        icon="search"
        title={t('schoolConsole.filters.sheet.empty.title')}
        message={t('schoolConsole.filters.sheet.empty.message')}
      />
    );
  }

  return (
    <View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors[athleteFilterOptionsColors.title] }]}>
        {filterSheetLabel(id)}
      </Text>
      {body}
    </View>
  );
}
