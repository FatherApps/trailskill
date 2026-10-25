import type { ReactNode } from 'react';
import { FlatList, PixelRatio, StyleSheet, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { distances, strokes, type DistanceCode, type StrokeCode } from '../../../core/sport';
import type { RecordSyncState } from '../../../core/sync';
import { typography as baseTypography, useTheme, type ColorToken } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { spokenTime } from '../../../core/time';
import { SyncStatus, Tag, TimeValue, type IconName } from '../../../core/ui';
import '../i18n';
import { formatDate } from './formatDate';

export type HistoryOrigin = 'own' | 'import' | 'external_timer' | 'other_school';

// What the time measures: a whole race, one repetition of a series, a series total or a split inside a race.
export type HistoryValue =
  | { kind: 'race' }
  | { kind: 'repetition'; index: number }
  | { kind: 'series_total' }
  | { kind: 'split'; distance: DistanceCode };

export type HistoryResult = {
  id: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  // ISO date (YYYY-MM-DD).
  date: string;
  context: 'training' | 'competition';
  origin: HistoryOrigin;
  // Name of the import provider or of the other school, from data; never written in code.
  sourceName?: string;
  value: HistoryValue;
  // A missing time is `null`, never 0.
  time: Hundredths | null;
  // Completed without a time (only with `time` null).
  completed?: boolean;
  isPersonalBest?: boolean;
  syncState: RecordSyncState;
};

export type HistoryListProps = {
  results: HistoryResult[];
  // Set to false when the list sits inside a parent ScrollView, which scrolls instead.
  scrollEnabled?: boolean;
  // Scroll with the rows, above and below them and outside the card: a screen puts its content here so the
  // whole screen is this one virtualized list instead of a list inside a ScrollView.
  header?: ReactNode;
  footer?: ReactNode;
};

export const historyListColors: { card: ColorToken; separator: ColorToken; title: ColorToken; meta: ColorToken } = {
  card: 'surface-1',
  separator: 'border',
  title: 'ink',
  meta: 'ink-muted',
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // Large text: the time goes below the text, each at the full row width, so no word is split.
  rowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  // The text block shrinks (minWidth 0) and the time keeps its own width, so the two never overlap.
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  tag: { alignSelf: 'flex-start', maxWidth: '100%' },
  trailing: { alignItems: 'flex-end', flexShrink: 0 },
  trailingLarge: { alignItems: 'flex-start' },
});

// From this text scale up the two columns no longer fit side by side.
const largeTextScale = 1.5;

// The row is one accessible element: its parts are hidden from screen readers and the label says them all.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

const nameOf = (catalog: readonly { code: string; nameKey: string }[], code: string) =>
  t(catalog.find((entry) => entry.code === code)?.nameKey ?? code);

const originTag = (result: HistoryResult): { label: string; icon: IconName } | null => {
  switch (result.origin) {
    case 'own':
      return null;
    case 'import':
      return { label: result.sourceName || t('athletes.history.origin.import'), icon: 'cloud_download' };
    case 'external_timer':
      return { label: t('athletes.history.origin.external_timer'), icon: 'link' };
    case 'other_school':
      return {
        label: result.sourceName
          ? t('athletes.history.origin.other_school_named', { source: result.sourceName })
          : t('athletes.history.origin.other_school'),
        icon: 'group',
      };
  }
};

const valueLabel = (value: HistoryValue): string | null => {
  switch (value.kind) {
    case 'race':
      return null;
    case 'repetition':
      return t('athletes.history.value.repetition', { index: value.index });
    case 'series_total':
      return t('athletes.history.value.series_total');
    case 'split':
      return t('athletes.history.value.split', { distance: nameOf(distances, value.distance) });
  }
};

function HistoryRow({ result }: { result: HistoryResult }) {
  const { colors, space, size, typography } = useTheme();
  // The gallery preview scale (theme) and the system scale both apply.
  const large =
    (typography.caption.fontSize / baseTypography.caption.fontSize) * PixelRatio.getFontScale() >= largeTextScale;

  const title = `${nameOf(strokes, result.stroke)} ${nameOf(distances, result.distance)}`;
  const context = t(`athletes.history.context.${result.context}`);
  const value = valueLabel(result.value);
  const origin = originTag(result);
  const shortDate = formatDate(result.date, 'short');
  const longDate = formatDate(result.date, 'long');

  // A malformed date is left out rather than shown wrong.
  const meta = [shortDate, context, value].filter(Boolean).join(' · ');

  const spokenResult =
    result.time !== null
      ? spokenTime(result.time)
      : t(result.completed ? 'time_value.completed_spoken' : 'time_value.not_recorded');

  const label = [
    title,
    longDate,
    context,
    value,
    origin?.label,
    spokenResult,
    result.time !== null && result.isPersonalBest ? t('time_value.pb_spoken') : null,
    t(`sync.${result.syncState}`),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.row,
        large && styles.rowLarge,
        {
          gap: space[3],
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          minHeight: size['target-min'],
        },
      ]}
    >
      <View {...hidden} style={[large ? undefined : styles.text, { gap: space[1] }]}>
        <Text style={[typography['body-strong'], { color: colors[historyListColors.title] }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors[historyListColors.meta] }]}>{meta}</Text>
        {origin && (
          <View style={styles.tag}>
            <Tag variant="outline" icon={origin.icon} label={origin.label} />
          </View>
        )}
      </View>
      <View {...hidden} style={[styles.trailing, large && styles.trailingLarge, { gap: space[1] }]}>
        <TimeValue
          value={result.time}
          size="time-sm"
          completed={result.completed}
          newPersonalBest={result.isPersonalBest}
        />
        <SyncStatus state={result.syncState} />
      </View>
    </View>
  );
}

// Presentational: the caller supplies the results (newest first) and each one's real sync state.
export function HistoryList({ results, scrollEnabled = true, header, footer }: HistoryListProps) {
  const { colors, radius } = useTheme();

  if (results.length === 0 && header === undefined && footer === undefined) return null;

  const last = results.length - 1;

  return (
    // A list that scrolls fills the height it is given; with no bounded height it would just grow.
    <View style={{ alignSelf: 'stretch', flex: scrollEnabled ? 1 : undefined }}>
      <FlatList
        data={results}
        scrollEnabled={scrollEnabled}
        keyExtractor={(result) => result.id}
        ListHeaderComponent={header === undefined ? undefined : <>{header}</>}
        ListFooterComponent={footer === undefined ? undefined : <>{footer}</>}
        // The card is drawn row by row, so the header and footer sit outside it.
        renderItem={({ item, index }) => (
          <View
            style={{
              backgroundColor: colors[historyListColors.card],
              borderTopLeftRadius: index === 0 ? radius.md : 0,
              borderTopRightRadius: index === 0 ? radius.md : 0,
              borderBottomLeftRadius: index === last ? radius.md : 0,
              borderBottomRightRadius: index === last ? radius.md : 0,
              overflow: 'hidden',
            }}
          >
            <HistoryRow result={item} />
          </View>
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors[historyListColors.separator] }} />
        )}
      />
    </View>
  );
}
