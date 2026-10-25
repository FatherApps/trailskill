import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Button, Icon, StateView, SwimmerRow, SyncStatus } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

export type SummaryRecord = {
  id: string;
  shortName: string;
  initials: string;
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  // `null` is a missing time: the row shows "—", never 0,00.
  time: Hundredths | null;
  syncState: RecordSyncState;
};

export type TimingSummaryScreenProps = {
  subtitle: string;
  status: 'loading' | 'error' | 'ready';
  records: SummaryRecord[];
  // Slot for the shared Banner (issue 176), for example "4 tiempos guardados".
  banner?: ReactNode;
  onRetry: (recordId: string) => void;
  onRetryLoad: () => void;
  onCorrect: () => void;
  onFinish: () => void;
  onBack: () => void;
};

export function TimingSummaryScreen({
  subtitle,
  status,
  records,
  banner,
  onRetry,
  onRetryLoad,
  onCorrect,
  onFinish,
  onBack,
}: TimingSummaryScreenProps) {
  const { colors, space, radius } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.summary.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        {banner}
        {status === 'loading' && <StateView kind="loading" />}
        {status === 'error' && (
          <StateView
            kind="error"
            title={t('timing.summary.error_title')}
            message={t('timing.summary.error_message')}
            action={{ label: t('timing.summary.retry_load'), onPress: onRetryLoad }}
          />
        )}
        {status === 'ready' && records.length === 0 && (
          <StateView
            kind="empty"
            icon="timer"
            title={t('timing.summary.empty_title')}
            message={t('timing.summary.empty_message')}
          />
        )}
        {status === 'ready' && records.length > 0 && (
          <View style={{ gap: 1, overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.border }}>
            {records.map((record) => (
              <View key={record.id} style={{ backgroundColor: colors['surface-1'] }}>
                <SwimmerRow
                  name={record.shortName}
                  initials={record.initials}
                  color={record.color}
                  detail=""
                  bestTime={record.time}
                />
                <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
                  <SyncStatus state={record.syncState} onRetry={() => onRetry(record.id)} />
                </View>
              </View>
            ))}
          </View>
        )}
        {status === 'ready' && (
          <>
            {records.length > 0 && (
              <Button
                variant="secondary"
                label={t('timing.summary.correct')}
                icon={<Icon name="edit" size="icon-sm" />}
                onPress={onCorrect}
              />
            )}
            <Button label={t('timing.summary.finish')} onPress={onFinish} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
