import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Banner, Button, StateView } from '../../../core/ui';
import { ActionRow, useLargeText } from '../components/ActionRow';
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
  // The event, for example "Libre 50 m · Entrenamiento".
  eventSubtitle: string;
  // The shared clock; the container owns the real one.
  elapsedHundredths: Hundredths;
  arrivals: ArrivalListProps['arrivals'];
  onArrival: () => void;
  onUndoLast: () => void;
  // Ends the capture and opens the assignment of names; the series needs at least one arrival.
  onAssignNames: () => void;
  onBack: () => void;
  // The shared clock is running: the screen stays awake.
  running?: boolean;
  // Shows the offline notice. Nothing is disabled: times are saved on the phone.
  offline?: boolean;
  externalTimerDisconnected?: boolean;
  onUseOnScreenStopwatch?: () => void;
};

export function SeriesTimingScreen({
  athleteCount,
  eventSubtitle,
  elapsedHundredths,
  arrivals,
  onArrival,
  onUndoLast,
  onAssignNames,
  onBack,
  running = false,
  offline = false,
  externalTimerDisconnected = false,
  onUseOnScreenStopwatch,
}: SeriesTimingScreenProps) {
  const { colors, space } = useTheme();
  const large = useLargeText();
  const hasArrivals = arrivals.length > 0;
  useAwakeWhile(running);
  const arrive = withTap(onArrival);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.series.title', { count: athleteCount })} subtitle={eventSubtitle} onBack={onBack} />
      <View style={{ paddingHorizontal: space[4], gap: space[2] }}>
        {offline && <OfflineBanner />}
        {externalTimerDisconnected && (
          <View testID="external-disconnected" accessibilityLiveRegion="polite">
            <Banner variant="warn" icon="link">
              {t('timing.series.external_disconnected_title')} {t('timing.series.external_disconnected_message')}
            </Banner>
            {onUseOnScreenStopwatch && (
              <Button variant="ghost" label={t('timing.series.use_screen_stopwatch')} onPress={onUseOnScreenStopwatch} />
            )}
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, gap: space[4], padding: space[4] }}>
        <Clock value={elapsedHundredths} muted={elapsedHundredths === 0} />
        {hasArrivals ? (
          <ArrivalList arrivals={arrivals} />
        ) : (
          <StateView kind="empty" icon="timer" title={t('timing.series.empty_title')} message={t('timing.series.empty_message')} />
        )}
      </ScrollView>
      <View style={{ padding: space[4] }}>
        {hasArrivals ? (
          <ActionRow
            large={large}
            secondary={{ variant: 'secondary', size: 'timing', label: t('timing.series.undo_last'), onPress: onUndoLast }}
            primary={{ size: 'timing', label: t('timing.series.arrival'), onPress: arrive }}
            renderPrimary={(props) => <ArrivalButton onArrival={props.onPress} />}
          />
        ) : (
          <ArrivalButton onArrival={arrive} />
        )}
        <View style={{ paddingTop: space[3] }}>
          <Button
            label={t('timing.series.assign_names')}
            onPress={onAssignNames}
            disabledReason={hasArrivals ? undefined : t('timing.series.assign_names_disabled')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
