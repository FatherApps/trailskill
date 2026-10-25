import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { fontFamily, useTheme, type ColorToken } from '../../../core/theme';
import { formatTime, spokenTime, type Hundredths } from '../../../core/time';
import { Icon, TimeValue } from '../../../core/ui';
import '../i18n';
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
  { background: 'surface-1', caption: 'ink-muted', time: 'ink', delta: 'success' };

// Hermes' Intl support for es-CO is not guaranteed, so months come from translations; returns null for a malformed date.
function formatDate(iso: string, style: 'short' | 'long'): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return t(`athletes.date.${style}`, {
    day: Number(match[3]),
    month: t(`athletes.date.month_${style}.${month}`),
    year: match[1],
  });
}

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
        // The reference draws 14/20; 14 is not a space token, so the vertical padding is space[3] (12).
        paddingVertical: space[3],
        paddingHorizontal: space[5],
      }}
    >
      <View {...hidden} style={{ gap: space[1] }}>
        <Text style={[typography.caption, { color: colors[personalBestColors.caption] }]}>
          {t('athletes.personal_best.caption', {
            stroke: strokeLabel(stroke),
            distance: distanceLabel(distance),
            pool: poolText,
          })}
        </Text>
        <TimeValue size="time-lg" value={best} />
        {shown && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <Icon name="arrow_upward" size="icon-sm" color={personalBestColors.delta} />
            <Text
              style={[
                // Same mono semibold caption as the TimeValue delta.
                typography.caption,
                {
                  fontFamily: fontFamily.monoSemiBold,
                  fontWeight: '600',
                  fontVariant: ['tabular-nums'],
                  color: colors[personalBestColors.delta],
                },
              ]}
            >
              {t('athletes.personal_best.improvement', {
                time: formatTime(shown.hundredths),
                count: shown.months,
              })}
            </Text>
          </View>
        )}
        {footer && <Text style={[typography.caption, { color: colors[personalBestColors.caption] }]}>{footer}</Text>}
      </View>
    </View>
  );
}
