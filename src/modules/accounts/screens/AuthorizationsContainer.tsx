import { useCallback, useEffect, useState } from 'react';

import type { AuthorizationRecord, AuthorizationRepository, AuthorizationText } from '../data/authorizations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { AuthorizationsScreen, type AuthorizationsScreenProps } from './AuthorizationsScreen';

export type AuthorizationsContainerProps = {
  repository: AuthorizationRepository;
  userId: string;
  athletes: { id: string; name: string }[];
  mode: 'registration' | 'manage';
  // Registration only: the draft says how many steps there are and is dropped when the last one is done.
  drafts?: RegistrationDraftRepository;
  onDone: () => void;
  onBack?: () => void;
};

type Loaded = { texts: AuthorizationText[]; rows: AuthorizationRecord[] };

// The in-force row of each athlete and purpose: the latest acceptance that was not withdrawn.
function inForceOf(rows: AuthorizationRecord[]): AuthorizationsScreenProps['inForce'] {
  const result: AuthorizationsScreenProps['inForce'] = {};
  for (const row of rows) {
    if (row.withdrawnAt !== null) continue;
    (result[row.athleteId] ??= {})[row.purpose] = row;
  }
  return result;
}

// Loads the current texts and this adult's authorizations from the local database; accepting and withdrawing reload them.
export function AuthorizationsContainer({ repository, userId, athletes, mode, drafts, onDone, onBack }: AuthorizationsContainerProps) {
  const [loaded, setLoaded] = useState<Loaded>();
  // 4 steps unless the draft says an adult swims, who skips the athlete details.
  const [total, setTotal] = useState(4);
  const [failed, setFailed] = useState(false);
  const athleteKey = athletes.map((athlete) => athlete.id).join(',');

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const [texts, rows] = await Promise.all([
      repository.listCurrentTexts('es-CO'),
      repository.listAuthorizations(userId, athleteKey ? athleteKey.split(',') : []),
    ]).catch((): [AuthorizationText[], AuthorizationRecord[]] => [[], []]);
    return { texts, rows };
  }, [repository, userId, athleteKey]);
  const load = async () => setLoaded(await fetchAll());

  useEffect(() => {
    let current = true;
    fetchAll().then((result) => current && setLoaded(result));
    return () => {
      current = false;
    };
  }, [fetchAll]);

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
      // A failed draft cleanup must not block the flow.
      await drafts?.clear().catch(() => {});
      onDone();
      return true;
    }
    await load();
    return true;
  }

  async function withdraw(id: string) {
    setFailed(false);
    await repository.withdraw(id).catch(() => setFailed(true));
    await load();
  }

  if (!loaded) return null;
  return (
    <AuthorizationsScreen
      mode={mode}
      step={mode === 'registration' ? { current: total, total } : undefined}
      athletes={athletes}
      texts={loaded.texts}
      inForce={inForceOf(loaded.rows)}
      failed={failed}
      onSave={save}
      onWithdraw={withdraw}
      onBack={onBack ?? onDone}
    />
  );
}
