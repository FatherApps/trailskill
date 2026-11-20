import { useEffect, useRef, useState, type ReactNode } from 'react';

import { t } from '../../../core/i18n';
import { RecordSyncStatus, useQuery } from '../../../core/sync';
import { SyncStatus } from '../../../core/ui';
import { PhotoCard, type PhotoCardNotice } from '../components/PhotoCard';
import { PhotoRemoveSheet } from '../components/PhotoRemoveSheet';
import type { PhotoPicker, PhotoSource } from '../data/athletePhotoPicker';
import type { AthletePhotoService } from '../data/athletePhotoUploads';
import '../i18n';

export type AthletePhotoContainerProps = {
  athleteId: string;
  // The signed-in adult: the author of the photo row.
  userId: string;
  // useHasValidAuthorization(athleteId, 'show_photo') from accounts, read by the route (athletes cannot import it without a cycle).
  authorized: boolean;
  online: boolean;
  service: AthletePhotoService;
  picker: PhotoPicker;
  // The athlete's `lg` avatar with their photo, ready made by the profile container.
  avatar: ReactNode;
  // Without show_photo the only button opens the authorization flow of accounts (the route navigates there).
  onAuthorize: () => void;
};

// Add, change and remove the athlete's photo. The route passes it only to who manages the athlete (a guardian, or the adult athlete): the server refuses anyone else.
export function AthletePhotoContainer({ athleteId, userId, authorized, online, service, picker, avatar, onAuthorize }: AthletePhotoContainerProps) {
  const { data } = useQuery<{ row_id: string | null; waiting: number }>(
    `SELECT (SELECT id FROM athlete_photos WHERE athlete_id = ?) AS row_id,
            EXISTS (SELECT 1 FROM athlete_photo_uploads WHERE athlete_id = ?) AS waiting`,
    [athleteId, athleteId],
  );
  const [busy, setBusy] = useState(false);
  // A second tap while the picker is open or a photo is being kept must not start another.
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<PhotoCardNotice>();
  const [removing, setRemoving] = useState<{ failed: boolean }>();

  // Without show_photo nothing of this athlete may wait on the phone to be sent.
  useEffect(() => {
    if (!authorized) void service.discard(athleteId).catch(() => {});
  }, [authorized, athleteId, service]);

  const rowId = data[0]?.row_id ?? null;
  const waiting = data[0]?.waiting === 1;
  const state = !authorized ? 'unauthorized' : waiting ? 'waiting' : rowId ? 'ready' : 'none';

  async function choose(source: PhotoSource) {
    if (inFlight.current) return;
    inFlight.current = true;
    setNotice(undefined);
    try {
      const result = await picker.pick(source);
      if (result.status === 'denied') setNotice('camera_denied');
      else if (result.status === 'picked') {
        setBusy(true);
        await service.add(athleteId, result.uri, userId);
      }
    } catch {
      // No path or error text in the log: they can name a file of a minor.
      setNotice('failed');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  function askToRemove() {
    setNotice(undefined);
    if (!online) return setNotice('remove_offline');
    setRemoving({ failed: false });
  }

  async function remove() {
    setBusy(true);
    try {
      await service.remove(athleteId);
      setRemoving(undefined);
    } catch {
      setRemoving({ failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PhotoCard
        state={state}
        avatar={avatar}
        status={state === 'waiting' ? <SyncStatus state="on_device" message={t('athletes.photo.waiting_status')} /> : rowId && authorized ? <RecordSyncStatus table="athlete_photos" id={rowId} /> : undefined}
        busy={busy}
        notice={notice}
        onAuthorize={onAuthorize}
        onTake={() => void choose('camera')}
        onChoose={() => void choose('library')}
        onRemove={state === 'ready' || state === 'waiting' ? askToRemove : undefined}
      />
      <PhotoRemoveSheet visible={removing !== undefined} reason="manual" failed={removing?.failed} onConfirm={() => void remove()} onCancel={() => setRemoving(undefined)} />
    </>
  );
}
