import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import '../i18n';
import { consistency, halfSplit, paceSegments, projectFinish, type PaceMark } from '../domain/pace';
import { formatMeters } from '../domain/splitMeters';

export type PaceSummaryProps = {
  /** The marks before the end, with the time since the start in any unit (`formatTime` writes it) and their meters or null. */
  marks: readonly PaceMark[];
  /** The time of the whole distance, in the same unit as the marks. */
  finalTime: number;
  /** The distance of the event chosen at the start, in meters: the projection always aims at it. */
  distance: number;
  formatTime: (value: number) => string;
};

/**
 * Pace of one measurement after the test: time and pace per 100 m of each segment, the first half against the second, the
 * consistency and the optimistic projection to the chosen distance (rule 8 of docs/product/my-times-rules.md). Presentational:
 * the maths is `domain/pace.ts`. Nothing shows without a mark with meters; the projection needs two of them.
 */
export function PaceSummary({ marks, finalTime, distance, formatTime }: PaceSummaryProps) {
  const { colors, radius, space, typography } = useTheme();
  const withEnd: PaceMark[] = [...marks, { t: finalTime, meters: distance }];
  const segments = paceSegments(withEnd);
  // The projection runs on the marks before the end: with the end included it would only repeat the final time.
  const projected = projectFinish(marks, distance);
  const halves = halfSplit(withEnd, distance);
  const spread = consistency(withEnd);
  if (segments.length < 2) return null;

  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatTime(Math.abs(value))}`;
  const muted = { color: colors['ink-muted'] };
  const row = [typography['time-sm'], { color: colors.ink, fontVariant: ['tabular-nums' as const] }];

  return (
    <View testID="pace-summary" style={{ gap: space[2], padding: space[4], borderRadius: radius.lg, backgroundColor: colors['surface-1'] }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
        {t('timing.pace.title')}
      </Text>
      {segments.map((s) => (
        <Text key={s.toMeters} style={row}>
          {t('timing.pace.segment', {
            from: formatMeters(s.fromMeters),
            to: formatMeters(s.toMeters),
            time: formatTime(s.time),
            pace: formatTime(s.pacePer100),
          })}
        </Text>
      ))}
      {halves && (
        <Text style={row}>
          {t('timing.pace.halves', { first: formatTime(halves.first), second: formatTime(halves.second), difference: signed(halves.difference) })}
        </Text>
      )}
      {spread !== null && (
        <Text style={[typography.body, { color: colors.ink }]}>{t('timing.pace.consistency', { value: (spread * 100).toFixed(1).replace('.', ',') })}</Text>
      )}
      {projected !== null && (
        <View>
          <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('timing.pace.projection', { time: formatTime(projected) })}</Text>
          <Text style={[typography.caption, muted]}>{t('timing.pace.projection_note')}</Text>
        </View>
      )}
    </View>
  );
}
