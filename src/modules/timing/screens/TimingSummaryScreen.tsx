import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Banner, Button, Icon, StateView, SwimmerRow, SyncStatus } from '../../../core/ui';
import { OfflineBanner } from '../components/OfflineBanner';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

export type SummaryRecord = {
  id: string;
  shortName: string;
  initials: string;
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  // `null` is a missing time: the row shows "—", never 0,00.
  time: Hundredths | null;
  // The athlete's personal best, to show the difference; absent or `null` means no comparison.
  personalBest?: Hundredths | null;
  syncState: RecordSyncState;
};

export type TimingSummaryScreenProps = {
  subtitle: string;
  status: 'loading' | 'error' | 'ready';
  records: SummaryRecord[];
  // Shows the offline notice above the rest. Nothing is disabled: times are saved on the phone.
  offline?: boolean;
  onRetry: (recordId: string) => void;
  onRetryLoad: () => void;
  // The record whose time the person chose to correct.
  onCorrect: (recordId: string) => void;
  onFinish: () => void;
  onBack: () => void;
};

export function TimingSummaryScreen({
  subtitle,
  status,
  records,
  offline = false,
  onRetry,
  onRetryLoad,
  onCorrect,
  onFinish,
  onBack,
}: TimingSummaryScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  // After "Corregir un tiempo" with several records, the rows become the choice.
  const [choosing, setChoosing] = useState(false);
  // A record without a time was not saved, so it is not counted.
  const saved = records.filter((record) => record.time !== null).length;
  const onDevice = records.filter((record) => record.syncState === 'on_device').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.summary.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        {offline && <OfflineBanner />}
        {status === 'ready' && saved > 0 && (
          <Banner variant="success" icon="check_circle">
            <Text style={typography['body-strong']}>{t('timing.summary.saved', { count: saved })}</Text>
            {onDevice > 0 && ` ${t('timing.summary.on_device', { count: onDevice })}`}
          </Banner>
        )}
        {choosing && (
          <Banner variant="info" icon="edit">
            {t('timing.summary.correct_choose')}
          </Banner>
        )}
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
                  time={record.time}
                  personalBest={record.personalBest}
                  newPersonalBest={
                    record.time !== null && typeof record.personalBest === 'number' && record.time < record.personalBest
                  }
                  timeLabel={t('timing.summary.time_label')}
                  status={<SyncStatus state={record.syncState} onRetry={() => onRetry(record.id)} />}
                  chevron={choosing}
                  onPress={choosing ? () => onCorrect(record.id) : undefined}
                />
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
                onPress={() => (records.length === 1 ? onCorrect(records[0]!.id) : setChoosing(true))}
              />
            )}
            <Button label={t('timing.summary.finish')} onPress={onFinish} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
