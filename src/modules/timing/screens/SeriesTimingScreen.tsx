import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { breakpoint, useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Banner, Button, Icon, SyncStatus, Tag } from '../../../core/ui';
import { useLargeText } from '../components/ActionRow';
import { ArrivalButton } from '../components/ArrivalButton';
import { ArrivalList, type ArrivalListProps } from '../components/ArrivalList';
import { Clock } from '../components/Clock';
import { OfflineBanner } from '../components/OfflineBanner';
import { TimingHeader } from '../components/TimingHeader';
import { useAwakeWhile } from '../components/useAwakeWhile';
import { withTap } from '../components/withTap';
import '../i18n';

export type SeriesTimingScreenProps = {
  athleteCount: number;
  // The number of the series in this session; absent for a series that is not the one being timed now.
  seriesNumber?: number;
  // The event, for example "Libre 50 m".
  eventTitle: string;
  // The kind of session, for example "Entrenamiento".
  sessionLabel: string;
  // The shared clock; the container owns the real one.
  elapsedHundredths: Hundredths;
  // The wall-clock time the series started, for example "7:14:02"; absent until the first press.
  startedAt?: string;
  arrivals: ArrivalListProps['arrivals'];
  onArrival: () => void;
  onUndoLast: () => void;
  // Ends the capture and opens the assignment of names; the series needs at least one arrival.
  onAssignNames: () => void;
  onBack: () => void;
  // The shared clock is running: the screen stays awake.
  running?: boolean;
  // Why the last attempt to name the arrivals did not go through; absent when there is nothing to say.
  error?: string;
  // Shows the offline notice. Nothing is disabled: times are saved on the phone.
  offline?: boolean;
  externalTimerDisconnected?: boolean;
  onUseOnScreenStopwatch?: () => void;
};

export function SeriesTimingScreen(props: SeriesTimingScreenProps) {
  const { width } = useWindowDimensions();
  useAwakeWhile(props.running ?? false);
  return width >= breakpoint['bp-medium'] ? <TabletSeries {...props} /> : <PhoneSeries {...props} />;
}

// The first press only starts the shared clock; from then on each press is the next position.
const nextPositionOf = (running: boolean | undefined, arrivalCount: number) => (running || arrivalCount > 0 ? arrivalCount + 1 : undefined);

const headingOf = ({ seriesNumber, eventTitle }: Pick<SeriesTimingScreenProps, 'seriesNumber' | 'eventTitle'>) =>
  seriesNumber === undefined ? t('timing.series.heading_unnumbered', { event: eventTitle }) : t('timing.series.heading', { number: seriesNumber, event: eventTitle });

// What the header says about the arrivals' own sync: how many are still on the phone, and any that did not go through.
function SyncSummary({ arrivals, attentionOnly = false }: Pick<SeriesTimingScreenProps, 'arrivals'> & { attentionOnly?: boolean }) {
  const { space } = useTheme();
  const count = (state: string) => arrivals.filter((a) => a.syncState === state).length;
  // The phone design has no count of arrivals on the phone; only a failure is worth the room there.
  const onPhone = attentionOnly ? 0 : count('on_device');
  const notSent = count('not_sent');
  const review = count('needs_review');
  if (onPhone + notSent + review === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
      {onPhone > 0 && <Tag variant="warn" label={t('timing.series.on_phone', { count: onPhone })} />}
      {notSent > 0 && <SyncStatus state="not_sent" count={notSent} />}
      {review > 0 && <SyncStatus state="needs_review" count={review} />}
    </View>
  );
}

// The notices above the screen's content: offline, a failed naming, a disconnected external timer.
function Notices({ offline, error, externalTimerDisconnected, onUseOnScreenStopwatch }: Pick<SeriesTimingScreenProps, 'offline' | 'error' | 'externalTimerDisconnected' | 'onUseOnScreenStopwatch'>) {
  const { space } = useTheme();
  if (!offline && !error && !externalTimerDisconnected) return null;
  return (
    <View style={{ gap: space[2] }}>
      {offline && <OfflineBanner />}
      {error && (
        <View accessibilityLiveRegion="polite">
          <Banner variant="warn" icon="error">
            {error}
          </Banner>
        </View>
      )}
      {externalTimerDisconnected && (
        <View testID="external-disconnected" accessibilityLiveRegion="polite">
          <Banner variant="warn" icon="link">
            {t('timing.series.external_disconnected_title')} {t('timing.series.external_disconnected_message')}
          </Banner>
          {onUseOnScreenStopwatch && <Button variant="ghost" label={t('timing.series.use_screen_stopwatch')} onPress={onUseOnScreenStopwatch} />}
        </View>
      )}
    </View>
  );
}

// "Deshacer última" and the button that ends the capture, side by side as in the design (1 : 1.4), stacked under large text.
function Actions({
  hasArrivals,
  phone,
  onUndoLast,
  onAssignNames,
}: Pick<SeriesTimingScreenProps, 'onUndoLast' | 'onAssignNames'> & { hasArrivals: boolean; phone: boolean }) {
  const { space } = useTheme();
  const large = useLargeText();
  return (
    <View style={{ flexDirection: large ? 'column-reverse' : 'row', gap: space[2] }}>
      {hasArrivals && (
        <View style={large ? undefined : { flex: 1 }}>
          <Button
            variant="secondary"
            label={t(phone ? 'timing.series.undo' : 'timing.series.undo_last')}
            icon={<Icon name="undo" />}
            onPress={onUndoLast}
          />
        </View>
      )}
      <View style={large ? undefined : { flex: hasArrivals ? 1.4 : 1 }}>
        <Button
          variant={phone ? 'secondary' : 'dark'}
          label={t(phone ? 'timing.series.assign_names' : 'timing.series.finish_and_assign')}
          trailingIcon={phone ? undefined : <Icon name="arrow_forward" color="on-primary" size="icon-sm" />}
          onPress={onAssignNames}
          disabledReason={hasArrivals ? undefined : t('timing.series.assign_names_disabled')}
        />
      </View>
    </View>
  );
}

// Tablet: the clock panel with the arrival button on the left, the arrivals on the right (LSerieLlegadas).
function TabletSeries({
  athleteCount,
  elapsedHundredths,
  startedAt,
  arrivals,
  onArrival,
  onUndoLast,
  onAssignNames,
  onBack,
  sessionLabel,
  ...rest
}: SeriesTimingScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const hasArrivals = arrivals.length > 0;
  const arrive = withTap(onArrival);
  const nextPosition = nextPositionOf(rest.running, arrivals.length);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader
        large
        title={headingOf(rest)}
        subtitle={`${sessionLabel} · ${t('timing.series.in_water', { count: athleteCount })}`}
        onBack={onBack}
        trailing={arrivals.some((a) => a.syncState && a.syncState !== 'synced' && a.syncState !== 'sending') ? <SyncSummary arrivals={arrivals} /> : undefined}
      />
      <View style={{ flex: 1, gap: space[4], paddingHorizontal: space[4], paddingBottom: space[4] }}>
        <Notices {...rest} />
        <View style={{ flex: 1, flexDirection: 'row', gap: space[5] }}>
          <View
            testID="clock-panel"
            style={{ flex: 1.15, overflow: 'hidden', alignItems: 'center', gap: space[4], padding: space[6], borderRadius: radius.lg, backgroundColor: colors.header }}
          >
            {/* Decoration of the design: a lilac ring that bleeds out of the bottom-left corner. */}
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: -80, bottom: -80, width: 260, height: 260, borderRadius: radius.full, borderWidth: 30, borderColor: colors.lilac, opacity: 0.35 }}
            />
            <Text style={[typography.label, { alignSelf: 'flex-start', color: colors['on-header-muted'] }]}>
              {startedAt ? t('timing.series.clock_label_started', { time: startedAt }) : t('timing.series.clock_label')}
            </Text>
            <Clock value={elapsedHundredths} onDark />
            <ArrivalButton onArrival={arrive} nextPosition={nextPosition} />
            <Text style={[typography.caption, { textAlign: 'center', color: colors['surface-2'] }]}>{t('timing.series.pulse_note')}</Text>
          </View>
          <View style={{ flex: 1, gap: space[3] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
                {t('timing.series.arrivals_title')}
              </Text>
              <Text style={[typography.label, { color: colors['ink-muted'] }]}>
                {t('timing.series.arrivals_count', { count: arrivals.length, total: Math.max(athleteCount, arrivals.length) })}
              </Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              <ArrivalList arrivals={arrivals} total={athleteCount} />
            </ScrollView>
            <Actions hasArrivals={hasArrivals} phone={false} onUndoLast={onUndoLast} onAssignNames={onAssignNames} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Phone: everything on the near-black background, the arrival button in the middle (LSerieMovil).
function PhoneSeries({
  athleteCount,
  elapsedHundredths,
  arrivals,
  onArrival,
  onUndoLast,
  onAssignNames,
  onBack,
  ...rest
}: SeriesTimingScreenProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const hasArrivals = arrivals.length > 0;
  const arrive = withTap(onArrival);
  const nextPosition = nextPositionOf(rest.running, arrivals.length);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.header }}>
      <View style={{ flex: 1, gap: space[3], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[6] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
            style={{
              minWidth: size['target-min'],
              minHeight: size['target-min'],
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.full,
              backgroundColor: colors['surface-1'],
            }}
          >
            <Icon name="arrow_back" />
          </Pressable>
          <View accessible accessibilityRole="header" accessibilityLabel={headingOf(rest)} style={{ flexShrink: 1 }}>
            <Tag label={headingOf(rest)} />
          </View>
        </View>
        <Notices {...rest} />
        <Clock value={elapsedHundredths} onDark />
        <View style={{ alignItems: 'center' }}>
          <SyncSummary arrivals={arrivals} attentionOnly />
        </View>
        {hasArrivals && (
          <ScrollView style={{ flexGrow: 0, maxHeight: 4 * 26 + 3 * space[2] }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[2] }}>
            {arrivals.map(({ id, time }, index) => (
              <View
                key={id}
                accessible
                accessibilityLabel={`${t('timing.series.position', { position: index + 1 })} ${formatTime(time)}`}
                style={{ minHeight: 26, paddingHorizontal: space[3], justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.action }}
              >
                <Text style={[typography['time-sm'], { color: colors['on-action'] }]}>{`${t('timing.series.position', { position: index + 1 })} ${formatTime(time)}`}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        <Text style={[typography.label, { textAlign: 'center', color: colors['on-header-muted'] }]}>
          {t('timing.series.arrivals_count_phone', { count: arrivals.length, total: Math.max(athleteCount, arrivals.length) })}
        </Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ArrivalButton compact onArrival={arrive} nextPosition={nextPosition} />
        </View>
        <Actions hasArrivals={hasArrivals} phone onUndoLast={onUndoLast} onAssignNames={onAssignNames} />
      </View>
    </SafeAreaView>
  );
}
