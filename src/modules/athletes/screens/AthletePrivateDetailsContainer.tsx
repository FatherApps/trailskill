import { useEffect, useState } from 'react';

import { t } from '../../../core/i18n';
import { RecordSyncStatus, useRecordSyncState } from '../../../core/sync';
import { StateView } from '../../../core/ui';
import { AthletePrivateDetailsForm } from '../components/AthletePrivateDetailsForm';
import { todayLocal, type PrivateDetails, type PrivateDetailsInput, type PrivateDetailsRepository } from '../data/athletePrivateDetails';
import '../i18n';

export type AthletePrivateDetailsContainerProps = {
  athleteId: string;
  repository: PrivateDetailsRepository;
};

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; details: PrivateDetails | null };

// Birth date and gender of the swimmer, inside "Datos del nadador". The route passes it only to who manages the swimmer; the server refuses anyone else (issue 1366),
// and a refusal that comes back after the upload shows as "No enviado" with its retry, even when the screen is opened again later. Everything is read and written
// on the device, so it works without a connection.
export function AthletePrivateDetailsContainer({ athleteId, repository }: AthletePrivateDetailsContainerProps) {
  // The route gives each swimmer its own instance (key), so the first state is always "loading"; only the retry sets it again.
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<PrivateDetailsInput & { id: string }>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const rowId = saved?.id ?? (loaded.status === 'ready' ? loaded.details?.id : undefined);
  const syncState = useRecordSyncState('athlete_private_details', rowId ?? '');

  useEffect(() => {
    let current = true;
    repository.get(athleteId).then(
      (details) => current && setLoaded({ status: 'ready', details }),
      // Nothing of the error in the log: the values belong to a minor.
      () => current && setLoaded({ status: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [repository, athleteId, attempt]);

  async function save(details: PrivateDetailsInput) {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      setSaved({ id: await repository.save(athleteId, details), ...details });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (loaded.status === 'loading') return <StateView kind="loading" />;
  if (loaded.status === 'error')
    return (
      <StateView
        kind="error"
        title={t('athletes.edit.private.load_error_title')}
        message={t('athletes.edit.private.load_error_message')}
        action={{ label: t('athletes.edit.private.retry'), onPress: () => {
            setLoaded({ status: 'loading' });
            setAttempt((n) => n + 1);
          },
        }}
      />
    );

  // Until the screen reads the device again, what was just saved is what the form compares with.
  const current = saved ?? loaded.details ?? { birthDate: null, gender: null };
  return (
    <AthletePrivateDetailsForm
      key={`${current.birthDate}\u0000${current.gender}`}
      birthDate={current.birthDate}
      gender={current.gender}
      today={todayLocal()}
      saving={saving}
      failed={failed}
      status={rowId && (saved || syncState !== 'synced') ? <RecordSyncStatus table="athlete_private_details" id={rowId} /> : undefined}
      onSave={(details) => void save(details)}
    />
  );
}
