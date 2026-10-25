import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime, type Hundredths } from '../../../core/time';
import { StateView, SwimmerRow, TimeValue, type SwimmerRowProps } from '../../../core/ui';
import '../i18n';
import { formatDateTime } from './formatDate';

// One written version of a measurement: who wrote it, on which device and when.
export type MeasurementVersion = {
  // `null` when the version has no time (never zero).
  time: Hundredths | null;
  author: string;
  device: string;
  // Local date-time, YYYY-MM-DDTHH:mm.
  at: string;
};

export type MeasurementEntry = {
  id: string;
  // Full name.
  athlete: string;
  initials: string;
  color: SwimmerRowProps['color'];
  // Already built, for example "Libre 50" (see eventLabel).
  event: string;
  // One version, or two or more when coaches wrote conflicting corrections: then the log only flags it.
  versions: [MeasurementVersion, ...MeasurementVersion[]];
};

export type MeasurementLogProps = {
  // Newest first: the order is the caller's.
  entries: MeasurementEntry[];
};

export const measurementLogColors: {
  background: ColorToken;
  divider: ColorToken;
  conflict: ColorToken;
  text: ColorToken;
  caption: ColorToken;
} = {
  background: 'surface-1',
  divider: 'border',
  conflict: 'warning-bg',
  text: 'ink',
  caption: 'ink-muted',
};

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

const dateAndHour = (at: string) => {
  const parts = formatDateTime(at);
  return parts ? [parts.date, parts.time] : [];
};

const versionName = (index: number) =>
  index === 0
    ? t('schoolConsole.measurements.version_first')
    : index === 1
      ? t('schoolConsole.measurements.version_second')
      : t('schoolConsole.measurements.version_n', { n: index + 1 });

// The chronological log of measurements. Presentational: it flags a conflict and shows both versions; resolving it is
// an audited decision of the platform administrator, outside this console, so there is no action here.
export function MeasurementLog({ entries }: MeasurementLogProps) {
  const { colors, space, radius, typography } = useTheme();

  if (entries.length === 0) {
    return (
      <StateView
        kind="empty"
        icon="timer"
        title={t('schoolConsole.measurements.no_results.title')}
        message={t('schoolConsole.measurements.no_results.message')}
      />
    );
  }

  const divider = { borderBottomWidth: 1, borderBottomColor: colors[measurementLogColors.divider] } as const;

  return (
    <View testID="measurement-log" style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[measurementLogColors.background] }}>
      {entries.map((entry, index) => {
        const [first, ...others] = entry.versions;
        const conflict = others.length > 0;
        return (
          <View key={entry.id} testID="measurement-entry" style={index < entries.length - 1 ? divider : undefined}>
            {conflict ? (
              <SwimmerRow
                name={entry.athlete}
                initials={entry.initials}
                color={entry.color}
                detail={[entry.event, ...dateAndHour(first.at).slice(0, 1)].join(' · ')}
                tag={{ label: t('schoolConsole.measurements.conflict'), variant: 'warn', icon: 'rule' }}
              />
            ) : (
              <SwimmerRow
                name={entry.athlete}
                initials={entry.initials}
                color={entry.color}
                detail={[entry.event, first.author, first.device, ...dateAndHour(first.at)].join(' · ')}
                time={first.time}
                timeLabel={t('schoolConsole.measurements.time')}
              />
            )}
            {conflict && (
              <View
                style={{
                  gap: space[2],
                  marginHorizontal: space[4],
                  marginBottom: space[3],
                  padding: space[3],
                  borderRadius: radius.md,
                  backgroundColor: colors[measurementLogColors.conflict],
                }}
              >
                <View style={{ gap: space[1] }}>
                  <Text style={[typography.label, { color: colors[measurementLogColors.text] }]}>
                    {t('schoolConsole.measurements.conflict_title')}
                  </Text>
                  <Text style={[typography.caption, { color: colors[measurementLogColors.caption] }]}>
                    {t('schoolConsole.measurements.conflict_note')}
                  </Text>
                </View>
                {entry.versions.map((version, versionIndex) => {
                  const when = dateAndHour(version.at);
                  const hour = when[1];
                  return (
                    <View
                      key={versionIndex}
                      accessible
                      accessibilityLabel={[
                        `${versionName(versionIndex)}: ${version.time === null ? t('schoolConsole.measurements.no_time') : spokenTime(version.time)}`,
                        version.author,
                        version.device,
                        hour,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    >
                      <View {...hidden} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                        <View style={{ flexShrink: 1 }}>
                          <Text style={[typography['body-strong'], { color: colors[measurementLogColors.text] }]}>{versionName(versionIndex)}</Text>
                          <Text style={[typography.caption, { color: colors[measurementLogColors.caption] }]}>
                            {[version.author, version.device, hour].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <TimeValue value={version.time} size="time-sm" />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
