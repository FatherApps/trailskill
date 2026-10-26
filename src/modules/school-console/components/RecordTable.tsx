import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import type { PoolCode } from '../../../core/sport';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime, type Hundredths } from '../../../core/time';
import { InitialsDot, StateView, Tag, TimeValue, type InitialsDotProps } from '../../../core/ui';
import '../i18n';
import { formatDate } from './formatDate';
import { useTextScale } from './textScale';

// The best mark of one event in one pool. A missing mark is `null` and so are the athlete and the date then: never 0,00.
export type RecordRow = {
  id: string;
  pool: PoolCode;
  // Already built, for example "Libre 50" (see eventLabel).
  event: string;
  time: Hundredths | null;
  // Full name of the athlete who holds the mark.
  athlete: string | null;
  // ISO date (YYYY-MM-DD) of the mark.
  date: string | null;
  // Name of the source when the record was imported: an imported record always shows it.
  source?: string;
};

export type RecordTableProps = {
  rows: RecordRow[];
  // Only the rows of this pool are shown: one row per event.
  pool: PoolCode;
  // The list form instead of the table.
  compact?: boolean;
};

export const recordTableColors: {
  background: ColorToken;
  header: ColorToken;
  text: ColorToken;
  muted: ColorToken;
  divider: ColorToken;
} = {
  background: 'surface-1',
  header: 'ink-muted',
  text: 'ink',
  muted: 'ink-muted',
  divider: 'border',
};

// The four columns, event, best mark, athlete and date: the three text columns share what is left (relative widths); the
// time keeps its own width, which grows with the text scale, and never shrinks.
const textFlex = { event: 1.4, athlete: 2, date: 1.8 } as const;
const TIME_WIDTH = 104;

// The athlete's dot: the rows carry only the name, so the initials are its first and last word and the colour follows the
// name (the same name, the same colour). shortcut: two athletes with the same name share a colour; give the row the
// athlete's own colour (as SwimmerRow gets it) if the table must tell them apart.
const dotColors: InitialsDotProps['color'][] = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'];
const dotOf = (name: string): InitialsDotProps => {
  const words = name.trim().split(/\s+/);
  const initials = `${words[0]!.charAt(0)}${words.length > 1 ? words[words.length - 1]!.charAt(0) : ''}`.toUpperCase();
  return { initials, color: dotColors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % dotColors.length]! };
};

// Narrowest the table can be at normal text size without breaking a word or a time: the longest word of each text
// column (about 85 + 70 + 90 dp, and 36 for the dot) plus the time column (104), their paddings and the row padding,
// with margin for longer names. Below `MIN_TABLE_WIDTH * text scale` (the width of the table's own box) the list form is used.
const MIN_TABLE_WIDTH = 560;

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// Best marks by category for one pool. Presentational: the rows arrive by props and the table only filters and lays out.
export function RecordTable({ rows, pool, compact = false }: RecordTableProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const scale = useTextScale();
  const [width, setWidth] = useState<number | null>(null);
  // Until the width is known the table is shown.
  const list = compact || (width !== null && width < MIN_TABLE_WIDTH * scale);

  const shown = rows.filter((row) => row.pool === pool);
  if (shown.length === 0) {
    return (
      <StateView
        kind="empty"
        icon="leaderboard"
        title={t('schoolConsole.records.pool_empty.title')}
        message={t('schoolConsole.records.pool_empty.message')}
      />
    );
  }

  const frame = { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors[recordTableColors.background] } as const;
  const divider = { borderBottomWidth: 1, borderBottomColor: colors[recordTableColors.divider] } as const;
  const measured = { testID: 'record-table', onLayout: (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width) };
  const text = { color: colors[recordTableColors.text] };
  const muted = { color: colors[recordTableColors.muted] };

  const spoken = (row: RecordRow, date: string | null) =>
    [row.event, row.time === null ? t('schoolConsole.records.no_mark') : spokenTime(row.time), row.athlete, date, row.source]
      .filter(Boolean)
      .join(', ');

  if (list) {
    return (
      <View {...measured} style={frame}>
        {shown.map((row, index) => {
          const date = row.date === null ? null : formatDate(row.date, 'short');
          const detail = [row.athlete, date].filter(Boolean).join(' · ');
          return (
            <View
              key={row.id}
              testID="record-row"
              accessible
              accessibilityLabel={spoken(row, date)}
              style={[{ gap: space[1], paddingVertical: space[3], paddingHorizontal: space[4], minHeight: size['target-min'] }, index < shown.length - 1 && divider]}
            >
              <View {...hidden} style={{ gap: space[1] }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                  <Text style={[typography['body-strong'], text, { flexShrink: 1 }]}>{row.event}</Text>
                  <TimeValue value={row.time} size="time-sm" />
                </View>
                {detail ? <Text style={[typography.caption, muted]}>{detail}</Text> : null}
                {row.source ? <Tag label={row.source} variant="info" icon="cloud_download" /> : null}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // Event, best mark (right-aligned), athlete and date: the lima records table.
  const header = [
    t('schoolConsole.records.event'),
    t('schoolConsole.records.best_mark'),
    t('schoolConsole.records.athlete'),
    t('schoolConsole.records.date'),
  ];
  const cell = { paddingHorizontal: space[2] } as const;
  const timeColumn = { flexShrink: 0, flexGrow: 0, width: TIME_WIDTH * scale } as const;
  // Header and rows share one column per index: event, time, athlete, date.
  const columns = [{ flex: textFlex.event }, timeColumn, { flex: textFlex.athlete }, { flex: textFlex.date }];

  return (
    <View {...measured} style={frame}>
      <View style={[{ flexDirection: 'row', alignItems: 'flex-end', paddingVertical: space[3], paddingHorizontal: space[4] }, divider]}>
        {header.map((column, index) => (
          <Text
            key={index}
            style={[typography.label, cell, columns[index], { color: colors[recordTableColors.header], textAlign: index === 1 ? 'right' : 'left' }]}
          >
            {column}
          </Text>
        ))}
      </View>
      {shown.map((row, index) => {
        // An event without a mark has neither athlete nor date: its cells stay empty.
        const marked = row.time !== null;
        const date = row.date === null ? null : formatDate(row.date, 'short');
        return (
          <View
            key={row.id}
            testID="record-row"
            accessible
            accessibilityLabel={spoken(row, date)}
            style={[
              { flexDirection: 'row', alignItems: 'center', minHeight: size['target-min'], paddingVertical: space[3], paddingHorizontal: space[4] },
              index < shown.length - 1 && divider,
            ]}
          >
            <View {...hidden} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[typography['body-strong'], cell, text, columns[0]]}>{row.event}</Text>
              <View style={[cell, columns[1], { alignItems: 'flex-end' }]}>
                <TimeValue value={row.time} size="time-sm" />
              </View>
              <View style={[cell, columns[2], { flexDirection: 'row', alignItems: 'center', gap: space[2] }]}>
                {marked && row.athlete ? (
                  <>
                    <InitialsDot {...dotOf(row.athlete)} />
                    <Text style={[typography.body, text, { flexShrink: 1 }]}>{row.athlete}</Text>
                  </>
                ) : marked ? (
                  <Text style={[typography.body, muted]}>{t('schoolConsole.records.none')}</Text>
                ) : null}
              </View>
              <View style={[cell, columns[3], { gap: space[1] }]}>
                {marked ? <Text style={[typography.body, date ? text : muted]}>{date ?? t('schoolConsole.records.none')}</Text> : null}
                {row.source ? <Tag label={row.source} variant="info" icon="cloud_download" /> : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
