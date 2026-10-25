import { useEffect, type ReactNode } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { ConfirmSheet, SyncStatus } from '../../../core/ui';
import { Stopwatch, type StopwatchProps } from '../components/Stopwatch';
import { TimingHeader } from '../components/TimingHeader';
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
  // Slot for the shared Banner (issue 176), for example the offline notice. It never blocks the stopwatch.
  banner?: ReactNode;
  // Sync state of the record being timed, drawn as a pill in the header. SyncStatus cannot show a pending count.
  syncState?: RecordSyncState;
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
  banner,
  syncState,
  onBack,
  exitConfirmVisible,
  onConfirmExit,
  onCancelExit,
  ...stopwatch
}: StopwatchScreenProps) {
  const { colors, space } = useTheme();
  const running = stopwatch.state === 'running';

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
        trailing={syncState && <SyncStatus state={syncState} />}
        onBack={onBack}
      />
      {banner && <View style={{ paddingHorizontal: space[4] }}>{banner}</View>}
      <Stopwatch {...stopwatch} />
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
