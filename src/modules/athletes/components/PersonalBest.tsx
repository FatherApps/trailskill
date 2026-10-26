import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { useTheme, type ColorToken } from '../../../core/theme';
import { formatTime, spokenTime, type Hundredths } from '../../../core/time';
import { Tag, TimeValue } from '../../../core/ui';
import '../i18n';
import { formatDate } from './formatDate';
import { distanceLabel, poolLabel, strokeLabel } from './sportLabel';

export type PersonalBestProps = {
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  // A missing best is `null`: the card shows "—", never 0,00.
  best: Hundredths | null;
  improvement?: { hundredths: Hundredths; months: number };
  kind?: 'competition' | 'training';
  // ISO date, yyyy-mm-dd.
  date?: string;
};

export const personalBestColors: { background: ColorToken; caption: ColorToken; time: ColorToken; delta: ColorToken } =
  // The improvement is an `ok` Tag: success on success-bg.
  { background: 'surface-1', caption: 'ink-muted', time: 'ink', delta: 'success' };

// The label already says everything its children show.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function PersonalBest({ stroke, distance, pool, best, improvement, kind, date }: PersonalBestProps) {
  const { colors, space, radius, typography } = useTheme();

  const event = `${strokeLabel(stroke)} ${distanceLabel(distance)}`;
  // "Piscina de 25 m" in the middle of a sentence.
  const poolText = poolLabel(pool).toLowerCase();
  const kindText = kind ? t(`athletes.personal_best.kind.${kind}`) : null;
  const shortDate = date ? formatDate(date, 'short') : null;
  const longDate = date ? formatDate(date, 'long') : null;
  const shown = best !== null ? improvement : undefined;

  const footer =
    kindText && shortDate
      ? t('athletes.personal_best.kind_and_date', { kind: kindText, date: shortDate })
      : (kindText ?? shortDate);

  const label = [
    t('athletes.personal_best.title'),
    event,
    poolText,
    best === null ? t('athletes.personal_best.none_spoken') : spokenTime(best),
    shown &&
      t('athletes.personal_best.improvement_spoken', {
        time: spokenTime(shown.hundredths),
        count: shown.months,
      }),
    kindText,
    longDate,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        backgroundColor: colors[personalBestColors.background],
        borderRadius: radius.md,
        padding: space[4],
      }}
    >
      <View {...hidden} style={{ gap: space[1] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] }}>
          <View style={{ flexShrink: 1, gap: space[1] }}>
            <Text style={[typography.caption, { color: colors[personalBestColors.caption] }]}>
              {t('athletes.personal_best.caption', {
                stroke: strokeLabel(stroke),
                distance: distanceLabel(distance),
                pool: poolText,
              })}
            </Text>
            <TimeValue size="time-lg" value={best} />
          </View>
          {shown && (
            <Tag
              variant="ok"
              icon="arrow_upward"
              label={t('athletes.personal_best.improvement', {
                time: formatTime(shown.hundredths),
                count: shown.months,
              })}
            />
          )}
        </View>
        {footer && <Text style={[typography.caption, { color: colors[personalBestColors.caption] }]}>{footer}</Text>}
      </View>
    </View>
  );
}
