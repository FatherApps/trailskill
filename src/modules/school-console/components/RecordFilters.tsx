import { Pressable, View } from 'react-native';

import { t } from '../../../core/i18n';
import { pools, type PoolCode } from '../../../core/sport';
import { useTheme } from '../../../core/theme';
import { Chip, ChipRow } from '../../../core/ui';
import '../i18n';

export type RecordFiltersProps = {
  // The category and the group records are limited to; the group chip is shown only with a group and its handler.
  category: string;
  group?: string;
  pool: PoolCode;
  // Only report the press: the options these chips open belong to the caller.
  onCategoryPress: () => void;
  onGroupPress?: () => void;
  onPoolChange: (pool: PoolCode) => void;
};

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// The chosen category or group, in black, which opens its options. It is a button for screen readers (a Chip alone is a
// radio of a ChipRow), so the spoken label says what it is and the chip underneath is hidden from them.
function OpenChip({ label, spoken, onPress }: { label: string; spoken: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress}>
      <View {...hidden}>
        <Chip label={label} selected onPress={onPress} />
      </View>
    </Pressable>
  );
}

// The filters of the records: category, group (when there is one) and pool, in one row that wraps.
export function RecordFilters({ category, group, pool, onCategoryPress, onGroupPress, onPoolChange }: RecordFiltersProps) {
  const { space } = useTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
      <OpenChip label={category} spoken={t('schoolConsole.records.category_spoken', { value: category })} onPress={onCategoryPress} />
      {group !== undefined && onGroupPress && (
        <OpenChip label={group} spoken={t('schoolConsole.records.group_spoken', { value: group })} onPress={onGroupPress} />
      )}
      <View style={{ flexShrink: 1 }}>
        <ChipRow
          accessibilityLabel={t('schoolConsole.records.pool_filter')}
          value={pool}
          onChange={onPoolChange}
          options={pools.map((entry) => ({ value: entry.code, label: t(`schoolConsole.records.pool.${entry.code}`) }))}
        />
      </View>
    </View>
  );
}
