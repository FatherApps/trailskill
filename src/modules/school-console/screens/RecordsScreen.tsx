import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { pools, type PoolCode } from '../../../core/sport';
import { useTheme } from '../../../core/theme';
import { Segmented, Tag } from '../../../core/ui';
import '../i18n';
import { RecordTable, type RecordRow } from '../components/RecordTable';
import { SectionFrame, type SectionView } from '../components/SectionFrame';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type RecordsContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  // The category the records are of, for example "Categoría B".
  category: string;
  // The best marks of the category in every pool; the table shows the ones of `pool`.
  rows: RecordRow[];
  pool: PoolCode;
};

export type RecordsView = SectionView<RecordsContent>;

export type RecordsScreenProps = ConsoleSectionProps & {
  view: RecordsView;
  // Only report the press: the category selector a chip would open is not part of this screen.
  onCategoryPress: () => void;
  onPoolChange: (pool: PoolCode) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function RecordsScreen({ width, schoolName, view, onNavigate, onCategoryPress, onPoolChange, scrollEnabled }: RecordsScreenProps) {
  const { colors, space, size, typography } = useTheme();

  return (
    <SectionFrame
      section="records"
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      scrollEnabled={scrollEnabled}
      summary={({ rows, pool, updatedMinutesAgo }) => ({
        count: t('schoolConsole.records.count', { count: rows.filter((row) => row.pool === pool).length }),
        updatedMinutesAgo,
      })}
    >
      {({ category, rows, pool }, compact) => (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('schoolConsole.records.category_spoken', { value: category })}
              onPress={onCategoryPress}
              // The chip is 24 dp high; the touch area is the full 48.
              style={{ minHeight: size['target-min'], justifyContent: 'center' }}
            >
              <View {...hidden}>
                <Tag label={category} variant="info" icon="expand_more" />
              </View>
            </Pressable>
            {/* The segments say only the length, so both fit at 200 % text; the group label says what they choose. */}
            <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 420, gap: space[1] }}>
              <Text style={[typography.label, { color: colors['ink-muted'] }]}>{t('schoolConsole.records.pool_filter')}</Text>
              <Segmented
                accessibilityLabel={t('schoolConsole.records.pool_filter')}
                value={pool}
                onChange={onPoolChange}
                options={pools.map((entry) => ({ value: entry.code, label: t(`schoolConsole.records.pool.${entry.code}`) }))}
              />
            </View>
          </View>
          <RecordTable rows={rows} pool={pool} compact={compact} />
        </>
      )}
    </SectionFrame>
  );
}
