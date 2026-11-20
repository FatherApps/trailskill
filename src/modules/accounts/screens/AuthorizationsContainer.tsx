import { useCallback, useEffect, useRef, useState } from 'react';

import { PhotoRemoveSheet, type AthletePhotoService, type PhotoRow } from '../../athletes';
import type { AuthorizationRecord, AuthorizationRepository, AuthorizationText } from '../data/authorizations';
import type { IdentityDocumentRepository, IdentityNumberHold } from '../data/identityDocuments';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { AuthorizationsScreen, type AuthorizationsScreenProps } from './AuthorizationsScreen';

export type AuthorizationsContainerProps = {
  repository: AuthorizationRepository;
  userId: string;
  athletes: { id: string; name: string }[];
  mode: 'registration' | 'manage';
  // Registration only: the draft says how many steps there are and is dropped when the last one is done.
  drafts?: RegistrationDraftRepository;
  // Registration only: the identity numbers typed while adding athletes are sent for those who accepted the import of official results, and dropped for the rest.
  identityNumbers?: IdentityNumberHold;
  identityDocuments?: IdentityDocumentRepository;
  // Manage only: withdrawing show_photo offers to delete the athlete's photo too (issue 1222). Left out, the withdrawal offers nothing.
  photos?: Pick<AthletePhotoService, 'find' | 'remove' | 'discard'>;
  onDone: () => void;
  onBack?: () => void;
  // Changes when new data may have synced (for example the last sync time); the texts and authorizations are read again.
  refreshKey?: unknown;
};

type Loaded = { texts: AuthorizationText[]; rows: AuthorizationRecord[]; gate: Set<string>; error: boolean };

// The in-force row of each athlete and purpose: the latest acceptance that was not withdrawn.
function inForceOf(rows: AuthorizationRecord[], gate: Set<string>): AuthorizationsScreenProps['inForce'] {
  const result: AuthorizationsScreenProps['inForce'] = {};
  for (const row of rows) {
    // The gate also counts the synced status (for example another adult's withdrawal), so the screen never disagrees with it.
    if (row.withdrawnAt !== null || !gate.has(`${row.athleteId}:${row.purpose}`)) continue;
    (result[row.athleteId] ??= {})[row.purpose] = row;
  }
  return result;
}

// Loads the current texts and this adult's authorizations from the local database; accepting and withdrawing reload them.
export function AuthorizationsContainer({ repository, userId, athletes, mode, drafts, identityNumbers, identityDocuments, photos, onDone, onBack, refreshKey }: AuthorizationsContainerProps) {
  const [loaded, setLoaded] = useState<Loaded>();
  // 4 steps unless the draft says an adult swims, who skips the athlete details.
  // Registration waits for the draft before showing a count, so an adult never sees "4 of 4" first.
  const [total, setTotal] = useState<number>();
  const [failed, setFailed] = useState(false);
  // The photo found at the moment of the withdrawal: the sync soon takes the row off the device, and the object must still be deleted by its path.
  const [photoOffer, setPhotoOffer] = useState<{ athleteId: string; row: PhotoRow; failed: boolean }>();
  const athleteKey = athletes.map((athlete) => athlete.id).join(',');

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    try {
      const [texts, rows] = await Promise.all([
        repository.listCurrentTexts('es-CO'),
        repository.listAuthorizations(userId, athleteKey ? athleteKey.split(',') : []),
      ]);
      const open = rows.filter((row) => row.withdrawnAt === null);
      const checks = await Promise.all(open.map((row) => repository.isInForce(row.athleteId, row.purpose)));
      const gate = new Set(open.filter((_, index) => checks[index]).map((row) => `${row.athleteId}:${row.purpose}`));
      return { texts, rows, gate, error: false };
    } catch {
      return { texts: [], rows: [], gate: new Set(), error: true };
    }
  }, [repository, userId, athleteKey]);
  // Each read takes a ticket and only the newest one may land: an older reload (for example from a sync) can finish after an accept or a withdrawal.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++latest.current;
    const result = await fetchAll();
    if (ticket === latest.current) setLoaded(result);
  }, [fetchAll]);

  useEffect(() => {
    void load();
    const ticket = latest;
    return () => {
      ticket.current++;
    };
  }, [load, refreshKey]);

  useEffect(() => {
    if (mode !== 'registration' || !drafts) return;
    let current = true;
    drafts
      .load()
      .catch(() => null)
      .then((draft) => current && setTotal(draft?.swimmer === 'adult' ? 3 : 4));
    return () => {
      current = false;
    };
  }, [mode, drafts]);

  // A registration cut before saving discards the numbers; after a save they are already gone, so this clears nothing.
  useEffect(() => () => identityNumbers?.clear(), [identityNumbers]);

  // Only for an athlete whose import of official results is in force (just accepted or already). Whatever is not sent is dropped: it is never kept for later.
  function sendIdentityNumbers(selected: { athleteId: string; text: AuthorizationText }[]) {
    const inForce = loaded ? inForceOf(loaded.rows, loaded.gate) : {};
    for (const { id } of athletes) {
      const number = identityNumbers?.take(id);
      const imports = selected.some((s) => s.athleteId === id && s.text.purpose === 'import_official_results') || !!inForce[id]?.import_official_results;
      // Fire and forget: a failed or slow send never blocks the registration, and #81 asks again.
      if (number && imports) void identityDocuments?.save({ athleteId: id, identityNumber: number }).catch(() => {});
    }
    identityNumbers?.clear();
  }

  // Resolves false when a local write failed, so the screen keeps the checked boxes.
  async function save(selected: { athleteId: string; text: AuthorizationText }[]): Promise<boolean> {
    setFailed(false);
    try {
      for (const { athleteId, text } of selected) await repository.accept({ userId, athleteId, text });
    } catch {
      // A failed local write keeps the screen and its checked boxes so the person can try again.
      setFailed(true);
      await load();
      return false;
    }
    if (mode === 'registration') {
      sendIdentityNumbers(selected);
      // A failed draft cleanup must not block the flow.
      await drafts?.clear().catch(() => {});
      onDone();
      return true;
    }
    await load();
    // Managing: a saved change returns to the view the person came from.
    onDone();
    return true;
  }

  // Without show_photo the photo no longer shows. What waits on this phone to be sent leaves it; a photo already stored is the person's to keep or delete.
  async function offerPhotoRemoval(athleteId: string) {
    if (!photos) return;
    try {
      await photos.discard(athleteId);
      const row = await photos.find(athleteId);
      if (row) setPhotoOffer({ athleteId, row, failed: false });
    } catch {
      // The withdrawal already worked; the photo stays hidden, and the offer is not worth a second error.
    }
  }

  async function withdraw(id: string) {
    setFailed(false);
    const record = loaded?.rows.find((row) => row.id === id);
    const withdrawn = await repository.withdraw(id).then(
      () => true,
      () => (setFailed(true), false),
    );
    if (withdrawn && record?.purpose === 'show_photo') await offerPhotoRemoval(record.athleteId);
    await load();
  }

  async function removePhoto() {
    if (!photoOffer || !photos) return;
    try {
      await photos.remove(photoOffer.athleteId, photoOffer.row);
      setPhotoOffer(undefined);
    } catch {
      setPhotoOffer({ ...photoOffer, failed: true });
    }
  }

  const stepsKnown = mode !== 'registration' || !drafts || total !== undefined;
  if (!loaded || !stepsKnown) return null;
  const steps = total ?? 4;
  return (
    <>
      <AuthorizationsScreen
        mode={mode}
        step={mode === 'registration' ? { current: steps, total: steps } : undefined}
        athletes={athletes}
        texts={loaded.texts}
        inForce={inForceOf(loaded.rows, loaded.gate)}
        failed={failed || (loaded.error ? 'load' : false)}
        onSave={save}
        onWithdraw={withdraw}
        onBack={onBack ?? onDone}
      />
      <PhotoRemoveSheet visible={photoOffer !== undefined} reason="withdrawn" failed={photoOffer?.failed} onConfirm={() => void removePhoto()} onCancel={() => setPhotoOffer(undefined)} />
    </>
  );
}
