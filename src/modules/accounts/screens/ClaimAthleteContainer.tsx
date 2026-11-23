import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AthleteRegistrationRepository } from '../../athletes';
import type { AuthorizationRepository, AuthorizationText } from '../data/authorizations';
import { JOIN_PURPOSES } from '../data/invitations';
import { ClaimAthleteScreen, type ClaimFailure, type ClaimRelation } from './ClaimAthleteScreen';

export type ClaimAthleteContainerProps = {
  // The token of the link the family opened.
  token: string;
  repository: Pick<AthleteRegistrationRepository, 'claim'>;
  authorizations: Pick<AuthorizationRepository, 'listCurrentTexts'>;
  // Makes the id of each authorization sent to the server. Left out, a random uuid.
  newId?: () => string;
  now?: () => Date;
  // The claim went through: the swimmer is now the family's and reaches the phone with the next sync.
  onDone: (athleteId: string) => void;
  onCancel: () => void;
  // Changes when new data may have synced (for example the last sync time): the texts are read again.
  refreshKey?: unknown;
};

const KNOWN: ClaimFailure[] = ['not_allowed', 'link_not_found', 'invalid'];

// Reads the three texts of joining a school from the local database and sends the claim with them. Accepting is one online call
// that makes the caller a manager of the swimmer and records the authorizations; the server answers a used link with link_not_found
// for everyone, so a lost answer is never repeated blindly: the text says to look in Mis deportistas first.
export function ClaimAthleteContainer({ token, repository, authorizations, newId = randomUUID, now = () => new Date(), onDone, onCancel, refreshKey }: ClaimAthleteContainerProps) {
  const [texts, setTexts] = useState<AuthorizationText[] | 'loading' | 'missing'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ClaimFailure | null>(null);
  // A ref, not state: a second press can arrive before a re-render shows the first is running.
  const claiming = useRef(false);

  useEffect(() => {
    let active = true;
    authorizations.listCurrentTexts('es-CO').then(
      (list) => {
        const joining = JOIN_PURPOSES.map((purpose) => list.find((text) => text.purpose === purpose));
        if (active) setTexts(joining.every(Boolean) ? (joining as AuthorizationText[]) : 'missing');
      },
      () => active && setTexts('missing'),
    );
    return () => {
      active = false;
    };
  }, [authorizations, refreshKey, attempt]);

  const accept = useCallback(
    async (relation: ClaimRelation) => {
      if (claiming.current || !Array.isArray(texts)) return;
      claiming.current = true;
      setBusy(true);
      setFailure(null);
      try {
        const athleteId = await repository.claim({
          token,
          relation,
          acceptedAt: now().toISOString(),
          authorizations: texts.map((text) => ({ id: newId(), purpose: text.purpose, textId: text.id })),
        });
        onDone(athleteId);
      } catch (error) {
        const code = error instanceof Error ? (error.message as ClaimFailure) : undefined;
        setFailure(code && KNOWN.includes(code) ? code : 'other');
      } finally {
        claiming.current = false;
        setBusy(false);
      }
    },
    [texts, repository, token, now, newId, onDone],
  );

  return (
    <ClaimAthleteScreen
      texts={texts}
      busy={busy}
      failure={failure}
      onAccept={(relation) => void accept(relation)}
      onRetryTexts={() => {
        setTexts('loading');
        setAttempt((n) => n + 1);
      }}
      onCancel={onCancel}
    />
  );
}
