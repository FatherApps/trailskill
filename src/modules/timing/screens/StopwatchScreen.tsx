import { useEffect } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { ConfirmSheet, SyncStatus } from '../../../core/ui';
import { OfflineBanner } from '../components/OfflineBanner';
import { Stopwatch, type StopwatchProps } from '../components/Stopwatch';
import { TimingHeader } from '../components/TimingHeader';
import { useAwakeWhile } from '../components/useAwakeWhile';
import { withTap } from '../components/withTap';
import '../i18n';

export type StopwatchScreenProps = StopwatchProps & {
  // Short name of the athlete being timed, for example "Mateo C.".
  athleteName: string;
  // 1-based position of this athlete in the session.
  position: number;
  total: number;
  // The event, for example "Libre 50 m · Entrenamiento".
  eventSubtitle: string;
  // Header back button and, while running, the Android back button. The container decides what to do (open the sheet).
  // Shows the offline notice. Nothing is disabled: times are saved on the phone.
  offline?: boolean;
  // Sync state of the record being timed, drawn as a pill in the header.
  syncState?: RecordSyncState;
  // Records of the session still on the phone, shown next to the pill ("En el teléfono · 3").
  // Only used while `syncState` is 'on_device': the count means records still on the phone.
  pendingCount?: number;
  onBack: () => void;
  // Controlled: the container shows the sheet when leaving would lose a running time.
  exitConfirmVisible: boolean;
  onConfirmExit: () => void;
  onCancelExit: () => void;
};

export function StopwatchScreen({
  athleteName,
  position,
  total,
  eventSubtitle,
  offline = false,
  syncState,
  pendingCount,
  onBack,
  exitConfirmVisible,
  onConfirmExit,
  onCancelExit,
  ...stopwatch
}: StopwatchScreenProps) {
  const { colors, space } = useTheme();
  const running = stopwatch.state === 'running';

  useAwakeWhile(running);

  useEffect(() => {
    if (!running) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [running, onBack]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader
        title={t('timing.stopwatch.title', { name: athleteName, current: position, total })}
        subtitle={eventSubtitle}
        trailing={syncState && <SyncStatus state={syncState} count={syncState === 'on_device' ? pendingCount : undefined} />}
        onBack={onBack}
      />
      {offline && (
        <View style={{ paddingHorizontal: space[4] }}>
          <OfflineBanner />
        </View>
      )}
      <Stopwatch
        {...stopwatch}
        onStart={withTap(stopwatch.onStart)}
        onSplit={withTap(stopwatch.onSplit)}
        onStop={withTap(stopwatch.onStop)}
      />
      <ConfirmSheet
        visible={exitConfirmVisible}
        destructive
        title={t('timing.stopwatch.exit_title')}
        message={t('timing.stopwatch.exit_message', { name: athleteName })}
        confirmLabel={t('timing.stopwatch.exit_confirm')}
        cancelLabel={t('timing.stopwatch.exit_cancel')}
        onConfirm={onConfirmExit}
        onCancel={onCancelExit}
      />
    </SafeAreaView>
  );
}
