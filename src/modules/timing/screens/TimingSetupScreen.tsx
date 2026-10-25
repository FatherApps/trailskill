import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Banner, Button, Segmented, StateView, SwimmerRow, type SegmentedOption } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

// The options arrive from the container (catalogs and session choices); the screen only draws them.
export type SetupField = { options: SegmentedOption<string>[]; value: string };

export type SetupAthlete = {
  id: string;
  shortName: string;
  initials: string;
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  bestTime: Hundredths | null;
  authorized: boolean;
};

export type TimingSetupScreenProps = {
  // For example the group and the time of the session.
  subtitle: string;
  stroke: SetupField;
  distance: SetupField;
  pool: SetupField;
  sessionType: SetupField;
  source: SetupField;
  onStrokeChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onPoolChange: (value: string) => void;
  onSessionTypeChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  // In timing order. Athletes without authorization are listed and marked as skipped.
  athletes: SetupAthlete[];
  selectedCount: number;
  groupCount: number;
  onChooseAthletes: () => void;
  // Arrivals of an earlier series still without a name; absent when there are none.
  pending?: { count: number; event: string; onOpen: () => void };
  onStart: () => void;
  onBack: () => void;
};

export function TimingSetupScreen({
  subtitle,
  stroke,
  distance,
  pool,
  sessionType,
  source,
  onStrokeChange,
  onDistanceChange,
  onPoolChange,
  onSessionTypeChange,
  onSourceChange,
  athletes,
  selectedCount,
  groupCount,
  onChooseAthletes,
  pending,
  onStart,
  onBack,
}: TimingSetupScreenProps) {
  const { colors, space, radius, typography } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.setup.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        {pending && (
          <View style={{ gap: space[2] }}>
            <Banner variant="warn" icon="schedule">
              {t('timing.setup.pending_message', { count: pending.count, event: pending.event })}
            </Banner>
            <Button variant="secondary" label={t('timing.setup.pending_open')} onPress={pending.onOpen} />
          </View>
        )}
        <Text style={[typography.subtitle, { color: colors.ink }]}>{t('timing.setup.question')}</Text>
        <Segmented accessibilityLabel={t('timing.setup.stroke')} onChange={onStrokeChange} {...stroke} />
        <Segmented accessibilityLabel={t('timing.setup.distance')} onChange={onDistanceChange} {...distance} />
        <Segmented accessibilityLabel={t('timing.setup.pool')} onChange={onPoolChange} {...pool} />
        <Segmented accessibilityLabel={t('timing.setup.session_type')} onChange={onSessionTypeChange} {...sessionType} />
        <Segmented accessibilityLabel={t('timing.setup.source')} onChange={onSourceChange} {...source} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Text style={[typography.label, { flex: 1, color: colors.ink }]}>
            {t('timing.setup.athletes_count', { selected: selectedCount, group: groupCount })}
          </Text>
          <Button variant="ghost" label={t('timing.setup.choose')} onPress={onChooseAthletes} />
        </View>
        {athletes.length === 0 ? (
          <StateView
            kind="empty"
            icon="group"
            title={t('timing.setup.empty_title')}
            message={t('timing.setup.empty_message')}
          />
        ) : (
          <View style={{ gap: 1, overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.border }}>
            {athletes.map((athlete, index) => (
              <SwimmerRow
                key={athlete.id}
                name={t('timing.setup.athlete_name', { order: index + 1, name: athlete.shortName })}
                initials={athlete.initials}
                color={athlete.color}
                detail={
                  athlete.authorized
                    ? t('timing.stopwatch.personal_best', { time: formatTime(athlete.bestTime) })
                    : ''
                }
                tag={
                  athlete.authorized
                    ? undefined
                    : { variant: 'warn', icon: 'schedule', label: t('timing.setup.skipped') }
                }
              />
            ))}
          </View>
        )}
        <View>
          <Button size="timing" label={t('timing.setup.start')} onPress={onStart} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
