import { Text, View } from 'react-native';

import { t } from '../../core/i18n';
import { recordSyncState, useGlobalSyncSummary } from '../../core/sync';
import { SyncStatus } from '../../core/ui';

export default function Home() {
  const summary = useGlobalSyncSummary();
  const state = recordSyncState({
    pending: summary.pending > 0,
    failed: summary.failed > 0,
    uploading: summary.uploading,
  });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{t('home.title')}</Text>
      <SyncStatus state={state} />
    </View>
  );
}
