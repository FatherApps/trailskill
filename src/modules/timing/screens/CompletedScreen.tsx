import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { Banner, Button, StateView, SyncStatus, type SwimmerRowProps } from '../../../core/ui';
import { CompletionRow } from '../components/CompletionRow';
import { OfflineBanner } from '../components/OfflineBanner';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

export type CompletedAthlete = {
  id: string;
  shortName: string;
  initials: string;
  color: NonNullable<SwimmerRowProps['color']>;
  completed: boolean;
  // The state of the completed measurement of this athlete; without it, or when not completed, no pill is drawn.
  syncState?: RecordSyncState;
};

export type CompletedScreenProps = {
  subtitle: string;
  // The athletes of the session, in order.
  athletes: CompletedAthlete[];
  // Shows the offline notice above the rest. Nothing is disabled: the changes are saved on the phone.
  offline?: boolean;
  // Why the last tap did not go through; absent when there is nothing to say.
  error?: string;
  onToggle: (athleteId: string) => void;
  onRetry: (athleteId: string) => void;
  onFinish: () => void;
  onBack: () => void;
};

// For work that only records that it was done: one "Completado" switch per athlete, never a time.
export function CompletedScreen({ subtitle, athletes, offline = false, error, onToggle, onRetry, onFinish, onBack }: CompletedScreenProps) {
  const { colors, space, radius } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.completed.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        {offline && <OfflineBanner />}
        {error && (
          <View accessibilityLiveRegion="polite">
            <Banner variant="warn" icon="error">
              {error}
            </Banner>
          </View>
        )}
        {athletes.length === 0 ? (
          <StateView kind="empty" icon="timer" title={t('timing.setup.empty_title')} message={t('timing.setup.empty_message')} />
        ) : (
          <View style={{ backgroundColor: colors['surface-1'], borderRadius: radius.md, overflow: 'hidden' }}>
            {athletes.map((athlete, index) => (
              <View key={athlete.id} style={index < athletes.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
                <CompletionRow
                  athlete={athlete}
                  checked={athlete.completed}
                  onToggle={() => onToggle(athlete.id)}
                  status={athlete.completed && athlete.syncState ? <SyncStatus state={athlete.syncState} onRetry={() => onRetry(athlete.id)} /> : undefined}
                />
              </View>
            ))}
          </View>
        )}
        <Button label={t('timing.completed.finish')} onPress={onFinish} />
      </ScrollView>
    </SafeAreaView>
  );
}
