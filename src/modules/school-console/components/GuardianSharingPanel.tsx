import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Banner, Button, Segmented, StateView, Tag, TimeValue } from '../../../core/ui';
import '../i18n';

// What the school lets a guardian see of its times. Presentational: the container reads and changes the choice.
export type SharingSwitchView =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  // Changing it needs the server, so without a connection there is nothing to press.
  | { kind: 'offline' }
  | {
      kind: 'ready';
      shared: boolean;
      saving: boolean;
      // Already translated; `null` when the last change worked.
      error: string | null;
      onChange: (shared: boolean) => void;
    };

export type SharingRecordRow = {
  id: string;
  // Already built, for example "Libre 50".
  event: string;
  // Local date, YYYY-MM-DD.
  date: string;
  time: Hundredths | null;
  // `null`: this device does not know yet, so the row offers nothing instead of guessing.
  shared: boolean | null;
};

export type SharingRecordsView =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'ready'; rows: SharingRecordRow[]; error: string | null; busyId: string | null; onToggle: (id: string, shared: boolean) => void };

export type GuardianSharingPanelProps = {
  // `school`: the default for new swimmers. `swimmer`: the switch of one swimmer, with the records one by one while it is off.
  scope: 'school' | 'swimmer';
  view: SharingSwitchView;
  records?: SharingRecordsView;
};

export const guardianSharingColors: { title: ColorToken; caption: ColorToken; divider: ColorToken } = {
  title: 'ink',
  caption: 'ink-muted',
  divider: 'border',
};

function Records({ view }: { view: SharingRecordsView }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.label, { color: colors[guardianSharingColors.title] }]}>
        {t('schoolConsole.sharing.records.title')}
      </Text>
      <Text style={[typography.caption, { color: colors[guardianSharingColors.caption] }]}>{t('schoolConsole.sharing.records.help')}</Text>
      {view.kind === 'loading' && <StateView kind="loading" />}
      {view.kind === 'error' && (
        <StateView
          kind="error"
          title={t('schoolConsole.sharing.records.error_title')}
          message={t('schoolConsole.sharing.load_error_message')}
          action={{ label: t('schoolConsole.sharing.retry'), onPress: view.onRetry }}
        />
      )}
      {view.kind === 'ready' && (
        <>
          {view.error && <Banner variant="warn" icon="error">{view.error}</Banner>}
          {view.rows.length === 0 && <Text style={[typography.body, { color: colors[guardianSharingColors.caption] }]}>{t('schoolConsole.sharing.records.empty')}</Text>}
          {view.rows.map((row, index) => (
            <View
              key={row.id}
              style={[
                { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], paddingVertical: space[3] },
                index < view.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors[guardianSharingColors.divider] },
              ]}
            >
              <Text style={[typography.body, { flexGrow: 1, color: colors[guardianSharingColors.title] }]}>{`${row.event} · ${row.date}`}</Text>
              <TimeValue value={row.time} size="time-sm" />
              <Tag
                label={row.shared === null ? t('schoolConsole.common.no_data') : t(row.shared ? 'schoolConsole.sharing.records.shared' : 'schoolConsole.sharing.records.not_shared')}
                variant={row.shared ? 'ok' : undefined}
              />
              {row.shared !== null && (
                <Button
                  variant="secondary"
                  label={t(row.shared ? 'schoolConsole.sharing.records.unshare' : 'schoolConsole.sharing.records.share')}
                  onPress={() => view.busyId === null && view.onToggle(row.id, !row.shared)}
                />
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

export function GuardianSharingPanel({ scope, view, records }: GuardianSharingPanelProps) {
  const { colors, space, typography } = useTheme();
  const key = `schoolConsole.sharing.${scope}`;
  return (
    <View style={{ gap: space[3] }}>
      <Text accessibilityRole="header" style={[typography.label, { color: colors[guardianSharingColors.title] }]}>{t(`${key}.title`)}</Text>
      <Text style={[typography.caption, { color: colors[guardianSharingColors.caption] }]}>{t(`${key}.help`)}</Text>
      {view.kind === 'loading' && <StateView kind="loading" />}
      {view.kind === 'error' && (
        <StateView
          kind="error"
          title={t('schoolConsole.sharing.load_error_title')}
          message={t('schoolConsole.sharing.load_error_message')}
          action={{ label: t('schoolConsole.sharing.retry'), onPress: view.onRetry }}
        />
      )}
      {view.kind === 'offline' && <Banner variant="info" icon="wifi_off">{t('schoolConsole.sharing.offline')}</Banner>}
      {view.kind === 'ready' && (
        <>
          <Segmented
            accessibilityLabel={t(`${key}.title`)}
            value={view.shared ? 'on' : 'off'}
            options={[
              { value: 'off', label: t('schoolConsole.sharing.off') },
              { value: 'on', label: t('schoolConsole.sharing.on') },
            ]}
            onChange={(value) => !view.saving && view.onChange(value === 'on')}
          />
          <Text style={[typography.body, { color: colors[guardianSharingColors.title] }]}>{t(`${key}.${view.shared ? 'state_on' : 'state_off'}`)}</Text>
          {view.error && <Banner variant="warn" icon="error">{view.error}</Banner>}
        </>
      )}
      {records && <Records view={records} />}
    </View>
  );
}
