import { useCallback, useEffect, useState } from 'react';

import { t } from '../../../core/i18n';
import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import { GuardianSharingPanel, type SharingRecordsView, type SharingSwitchView } from '../components/GuardianSharingPanel';
import { eventLabel } from '../components/eventLabel';
import { formatDate } from '../components/formatDate';
import { GuardianSharingError, type GuardianRecord, type GuardianRecordsRepository, type GuardianSharingRepository } from '../data/guardianSharing';

// The message of a failed change. 40P01 here means the repository already tried three times; 42501 is a role with no permission.
const failureText = (error: unknown) => {
  const code = error instanceof GuardianSharingError ? error.code : '';
  return t(`schoolConsole.sharing.errors.${code === '42501' ? 'denied' : code === '40P01' ? 'busy' : 'other'}`);
};

// Reading and changing one yes/no choice on the server. The answer is stored with the key it answers, so another swimmer never inherits it.
// `read` and `write` must keep their identity while the choice is the same.
function useSharingSwitch(
  key: string,
  online: boolean,
  read: () => Promise<boolean>,
  write: (shared: boolean) => Promise<void>,
  refreshKey: unknown,
): SharingSwitchView {
  const [answer, setAnswer] = useState<{ key: string; attempt: number; value: boolean | 'error' }>();
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ key: string; message: string }>();

  useEffect(() => {
    if (!online) return;
    let active = true;
    const settle = (value: boolean | 'error') => active && setAnswer({ key, attempt, value });
    read().then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [read, key, attempt, online, refreshKey]);

  if (!online) return { kind: 'offline' };
  const value = answer?.key === key && answer.attempt === attempt ? answer.value : undefined;
  if (value === undefined) return { kind: 'loading' };
  if (value === 'error') return { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  return {
    kind: 'ready',
    shared: value,
    saving,
    error: failure?.key === key ? failure.message : null,
    onChange: (shared) => {
      setSaving(true);
      setFailure(undefined);
      write(shared)
        .then(
          () => setAnswer({ key, attempt, value: shared }),
          (error: unknown) => setFailure({ key, message: failureText(error) }),
        )
        .finally(() => setSaving(false));
    },
  };
}

type SectionProps = {
  repository: GuardianSharingRepository;
  schoolId: string;
  // 'connecting' is not 'offline': the server may still answer.
  connection: SyncConnection;
  // Read again when this changes (a sync completed).
  refreshKey?: unknown;
};

// The school's default for new swimmers: administrator only (the server refuses anyone else).
export function SchoolSharingDefaultSection({ repository, schoolId, connection, refreshKey }: SectionProps) {
  const read = useCallback(() => repository.getSchoolDefault(schoolId), [repository, schoolId]);
  const write = useCallback((shared: boolean) => repository.setSchoolDefault(schoolId, shared), [repository, schoolId]);
  return <GuardianSharingPanel scope="school" view={useSharingSwitch(schoolId, connection !== 'offline', read, write, refreshKey)} />;
}

export type SwimmerSharingSectionProps = SectionProps & {
  athleteId: string;
  // Without it the record-by-record list is not offered.
  records?: GuardianRecordsRepository;
};

type LoadedRecords = { key: string; attempt: number; result: GuardianRecord[] | 'error' };

// The records of a swimmer while the switch is off, with what the device knows of each one's visibility.
function useRecords(
  records: GuardianRecordsRepository | undefined,
  repository: GuardianSharingRepository,
  athleteId: string,
  schoolId: string,
  enabled: boolean,
  refreshKey: unknown,
): SharingRecordsView | undefined {
  const key = `${athleteId}:${schoolId}`;
  const [loaded, setLoaded] = useState<LoadedRecords>();
  const [attempt, setAttempt] = useState(0);
  // What this session already changed: the device only learns it when the next sync arrives.
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string }>();

  useEffect(() => {
    if (!records || !enabled) return;
    let active = true;
    const settle = (result: LoadedRecords['result']) => {
      if (!active) return;
      setChanged({});
      setLoaded({ key, attempt, result });
    };
    records.list(athleteId, schoolId).then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [records, enabled, athleteId, schoolId, key, attempt, refreshKey]);

  if (!records || !enabled) return undefined;
  const result = loaded?.key === key && loaded.attempt === attempt ? loaded.result : undefined;
  if (result === undefined) return { kind: 'loading' };
  if (result === 'error') return { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  return {
    kind: 'ready',
    rows: result.map((record) => ({
      id: record.id,
      event: eventLabel(record.stroke, record.distance),
      date: formatDate(record.capturedAt, 'short') ?? t('schoolConsole.common.no_data'),
      time: record.time,
      shared: changed[record.id] ?? record.shared,
    })),
    error: failure?.key === key ? failure.message : null,
    busyId,
    onToggle: (id, shared) => {
      setBusyId(id);
      setFailure(undefined);
      repository
        .setRecordShared(id, shared)
        .then(
          () => setChanged((current) => ({ ...current, [id]: shared })),
          (error: unknown) => setFailure({ key, message: failureText(error) }),
        )
        .finally(() => setBusyId(null));
    },
  };
}

// The switch "Compartir todos los tiempos con el acudiente" of one swimmer in one school, and, while it is off, each record.
// Mount it with the swimmer as `key`, so nothing of the previous swimmer shows.
export function SwimmerSharingSection({ repository, records, athleteId, schoolId, connection, refreshKey }: SwimmerSharingSectionProps) {
  const read = useCallback(() => repository.getSwimmer(athleteId, schoolId), [repository, athleteId, schoolId]);
  const write = useCallback((shared: boolean) => repository.setSwimmer(athleteId, schoolId, shared), [repository, athleteId, schoolId]);
  const view = useSharingSwitch(`${athleteId}:${schoolId}`, connection !== 'offline', read, write, refreshKey);
  const recordsView = useRecords(records, repository, athleteId, schoolId, view.kind === 'ready' && !view.shared, refreshKey);
  return <GuardianSharingPanel scope="swimmer" view={view} records={recordsView} />;
}
