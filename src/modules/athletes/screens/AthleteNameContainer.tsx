import { useState } from 'react';

import { RecordSyncStatus, useRecordSyncState } from '../../../core/sync';
import { AthleteNameForm } from '../components/AthleteNameForm';
import { bumpAthleteNamesVersion } from '../data/athleteNamesVersion';
import type { AthleteRepository } from '../data/athleteRepository';
import '../i18n';

export type AthleteNameContainerProps = {
  athleteId: string;
  firstName: string;
  lastName: string;
  repository: Pick<AthleteRepository, 'renameProfile'>;
  // The route reads the local database again, so the title shows the new name.
  onRenamed?: () => void;
};

// Edit the swimmer's first and last name. The route passes it only to who manages the swimmer: the server refuses anyone else (issue 1364), and a refusal that comes
// back after the upload shows as "No enviado" with its retry, even when the screen is opened again later.
export function AthleteNameContainer({ athleteId, firstName, lastName, repository, onRenamed }: AthleteNameContainerProps) {
  const [saved, setSaved] = useState<{ firstName: string; lastName: string }>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const syncState = useRecordSyncState('athletes', athleteId);

  async function save(names: { firstName: string; lastName: string }) {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await repository.renameProfile(athleteId, names);
      setSaved(names);
      bumpAthleteNamesVersion();
      onRenamed?.();
    } catch {
      // No names in the log: they belong to a minor.
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  // Until the route reads the names again, what was just saved is what the form compares with.
  const current = saved ?? { firstName, lastName };
  return (
    <AthleteNameForm
      key={`${current.firstName}\u0000${current.lastName}`}
      firstName={current.firstName}
      lastName={current.lastName}
      saving={saving}
      failed={failed}
      status={saved || syncState !== 'synced' ? <RecordSyncStatus table="athletes" id={athleteId} /> : undefined}
      onSave={(names) => void save(names)}
    />
  );
}
