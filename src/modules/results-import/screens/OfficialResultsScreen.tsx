import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, StateView } from '../../../core/ui';
import { PendingChangeCard, type PendingChangeCardProps } from '../components/PendingChangeCard';
import { ResultRow, type ResultRowProps } from '../components/ResultRow';
import '../i18n';

export type ResultItem = Omit<ResultRowProps, 'onToggle' | 'selected'> & { id: string };
export type ChangeItem = Omit<PendingChangeCardProps, 'onUseNew' | 'onKeepCurrent'> & { id: string };

// What the last import did, shown above the rest.
export type ImportNotice = { inserted: number; changes: number } | 'expired' | 'failed';

export type OfficialResultsView =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  // The source is down or offline: nothing already imported is touched.
  | { kind: 'unavailable'; onRetry: () => void }
  // `retryAt` is already formatted ("12:10").
  | { kind: 'rate_limited'; retryAt: string }
  | {
      kind: 'list';
      items: ResultItem[];
      selectedIds: string[];
      importing: boolean;
      onToggle: (id: string) => void;
      onImport: () => void;
      onDismiss: () => void;
    };

export type OfficialResultsScreenProps = {
  view: OfficialResultsView;
  notice?: ImportNotice;
  changes: ChangeItem[];
  onUseNew: (changeId: string) => void;
  onKeepCurrent: (changeId: string) => void;
};

function Notice({ notice }: { notice: ImportNotice }) {
  if (notice === 'expired') return <Banner variant="warn" icon="schedule">{t('results_import.update.list.expired')}</Banner>;
  if (notice === 'failed') return <Banner variant="warn" icon="error">{t('results_import.update.list.failed')}</Banner>;
  return (
    <Banner variant="success" icon="check_circle">
      {[
        notice.inserted > 0 ? t('results_import.update.done.inserted', { count: notice.inserted }) : t('results_import.update.done.nothing'),
        notice.changes > 0 ? t('results_import.update.done.changes', { count: notice.changes }) : null,
      ]
        .filter(Boolean)
        .join(' ')}
    </Banner>
  );
}

// Presentational: the results the source found, the guardian's choice, and the differences waiting for an answer.
export function OfficialResultsScreen({ view, notice, changes, onUseNew, onKeepCurrent }: OfficialResultsScreenProps) {
  const { colors, space, typography } = useTheme();
  const heading = (key: string) => (
    <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
      {t(key)}
    </Text>
  );

  return (
    <View style={{ alignSelf: 'stretch', gap: space[3] }}>
      {notice && <Notice notice={notice} />}
      {view.kind === 'checking' && <StateView kind="loading" />}
      {view.kind === 'none' && (
        <StateView kind="empty" icon="cloud_done" title={t('results_import.update.none.title')} message={t('results_import.update.none.message')} />
      )}
      {view.kind === 'unavailable' && (
        <StateView
          kind="offline"
          title={t('results_import.update.unavailable.title')}
          message={t('results_import.update.unavailable.message')}
          action={{ label: t('results_import.update.unavailable.retry'), onPress: view.onRetry }}
        />
      )}
      {view.kind === 'rate_limited' && (
        <StateView
          kind="empty"
          icon="schedule"
          title={t('results_import.update.rate_limited.title')}
          message={t('results_import.update.rate_limited.message', { time: view.retryAt })}
        />
      )}
      {view.kind === 'list' && (
        <View style={{ gap: space[2] }}>
          {heading('results_import.update.list.title')}
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('results_import.update.list.hint')}</Text>
          {view.items.map(({ id, ...row }) => (
            <ResultRow key={id} {...row} selected={view.selectedIds.includes(id)} onToggle={() => view.onToggle(id)} />
          ))}
          <Button
            label={view.selectedIds.length === 0 ? t('results_import.update.list.none_selected') : t('results_import.update.list.import', { count: view.selectedIds.length })}
            loading={view.importing}
            loadingLabel={t('results_import.update.list.importing')}
            onPress={view.selectedIds.length === 0 || view.importing ? () => {} : view.onImport}
          />
          <Button variant="ghost" label={t('results_import.update.list.dismiss')} onPress={view.onDismiss} />
        </View>
      )}
      {changes.length > 0 && (
        <View style={{ gap: space[2] }}>
          {heading('results_import.update.changes.title')}
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('results_import.update.changes.hint')}</Text>
          {changes.map(({ id, ...card }) => (
            <PendingChangeCard key={id} {...card} onUseNew={() => onUseNew(id)} onKeepCurrent={() => onKeepCurrent(id)} />
          ))}
        </View>
      )}
    </View>
  );
}
