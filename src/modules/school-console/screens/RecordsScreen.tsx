import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { PoolCode } from '../../../core/sport';
import { useTheme } from '../../../core/theme';
import '../i18n';
import { OptionRow } from '../components/AthleteFilterOptions';
import { RecordFilters } from '../components/RecordFilters';
import { RecordTable, type RecordRow } from '../components/RecordTable';
import { SectionFrame, type SectionView } from '../components/SectionFrame';
import { SideSheet } from '../components/SideSheet';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type RecordsContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  // The category the records are of, for example "Categoría B".
  category: string;
  // The training group the records are limited to, for example "Todos los grupos"; the group filter is shown only with it.
  group?: string;
  // The best marks of the category in every pool; the table shows the ones of `pool`.
  rows: RecordRow[];
  pool: PoolCode;
};

export type RecordsView = SectionView<RecordsContent>;

// The options a chip opens: the one with `selectedId` is checked.
export type RecordsSheet = {
  label: string;
  options: { id: string; label: string }[];
  selectedId: string;
  onChoose: (id: string) => void;
  onClose: () => void;
};

export type RecordsScreenProps = ConsoleSectionProps & {
  view: RecordsView;
  // Only report the press: the category selector a chip would open is not part of this screen.
  onCategoryPress: () => void;
  onGroupPress?: () => void;
  // The open category or group options, over the console.
  sheet?: RecordsSheet;
  onPoolChange: (pool: PoolCode) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function RecordsScreen({ width, schoolName, view, onNavigate, onCategoryPress, onGroupPress, sheet, onPoolChange, scrollEnabled }: RecordsScreenProps) {
  const { colors, space, typography } = useTheme();

  return (
    <SectionFrame
      section="records"
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      scrollEnabled={scrollEnabled}
      overlay={
        sheet && (
          <SideSheet label={sheet.label} onClose={sheet.onClose}>
            <View style={{ gap: space[2] }}>
              <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
                {sheet.label}
              </Text>
              {sheet.options.map((option) => (
                <OptionRow key={option.id} label={option.label} selected={option.id === sheet.selectedId} onPress={() => sheet.onChoose(option.id)} />
              ))}
            </View>
          </SideSheet>
        )
      }
      summary={({ rows, pool, updatedMinutesAgo }) => ({
        count: t('schoolConsole.records.count', { count: rows.filter((row) => row.pool === pool).length }),
        updatedMinutesAgo,
      })}
    >
      {({ category, group, rows, pool }, compact) => (
        <>
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('schoolConsole.records.subtitle', { school: schoolName })}</Text>
          <RecordFilters
            category={category}
            group={group}
            pool={pool}
            onCategoryPress={onCategoryPress}
            onGroupPress={onGroupPress}
            onPoolChange={onPoolChange}
          />
          <RecordTable rows={rows} pool={pool} compact={compact} />
        </>
      )}
    </SectionFrame>
  );
}
