import { useCallback, useEffect, useMemo, useState } from 'react';

import { isValidIdentityNumber, normalizeIdentityNumber, type IdentityDocumentRepository } from '../../accounts';
import { t } from '../../../core/i18n';
import type { ImportSource, ImportSourcesRepository, OfficialSearchRepository, SearchCandidate, SearchFailure } from '../data/officialSearch';
import '../i18n';
import { ConfirmPersonScreen, type ConfirmPersonView, type NumberHint } from './ConfirmPersonScreen';

export type ConfirmPersonContainerProps = {
  athlete: { id: string; firstName: string; lastName: string };
  // import_official_results in force for this athlete, decided by the route.
  authorized: boolean;
  online: boolean;
  sources: ImportSourcesRepository;
  search: OfficialSearchRepository;
  identityDocuments: Pick<IdentityDocumentRepository, 'save' | 'hint'>;
  onGoToAuthorizations: () => void;
  onDone: () => void;
  onBack: () => void;
};

export const formatRetryTime = (retryAt: string) =>
  new Date(retryAt).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; source: ImportSource; hint: NumberHint } | { status: 'no_source' };

// What a failure of the server or the source turns the screen into. The first four leave the search form out of the way.
type Step =
  | { kind: 'start'; message?: string }
  | { kind: 'candidates'; candidates: SearchCandidate[] }
  | { kind: 'empty' }
  | { kind: 'confirmed' }
  | { kind: 'rate_limited'; retryAt: string }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
  | { kind: 'offline' };

// "Is this person?": searches the one athlete at the source and asks the guardian or adult athlete to confirm the history found.
export function ConfirmPersonContainer({
  athlete,
  authorized,
  online,
  sources,
  search,
  identityDocuments,
  onGoToAuthorizations,
  onDone,
  onBack,
}: ConfirmPersonContainerProps) {
  // The answer is stored with the request it belongs to: any other request shows as loading until its own answer lands.
  const [answer, setAnswer] = useState<{ key: string; result: Loaded }>();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [number, setNumber] = useState('');
  const [numberInvalid, setNumberInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const athleteName = athlete.firstName.trim();
  const requestKey = `${athlete.id}|${attempt}`;
  const loaded = useMemo<Loaded>(() => (answer?.key === requestKey ? answer.result : { status: 'loading' }), [answer, requestKey]);

  useEffect(() => {
    if (!authorized || !online) return;
    let current = true;
    // shortcut: uses the first source; a second federation needs a chooser, add it when a second provider is registered.
    Promise.all([sources.list(), identityDocuments.hint(athlete.id)]).then(
      ([list, hint]) => current && setAnswer({ key: requestKey, result: list[0] ? { status: 'ready', source: list[0], hint } : { status: 'no_source' } }),
      // Not knowing whether a number is saved is a load error, not a form: offering to type a number blindly could replace it.
      () => current && setAnswer({ key: requestKey, result: { status: 'error' } }),
    );
    return () => {
      current = false;
    };
  }, [authorized, online, sources, identityDocuments, athlete.id, requestKey]);

  const fail = useCallback((error: SearchFailure, onUnexpected: Step) => {
    switch (error.code) {
      case 'rate_limited':
        return setStep({ kind: 'rate_limited', retryAt: error.retryAt });
      case 'not_authorized':
        return setStep({ kind: 'unauthorized' });
      case 'no_provider':
      case 'unavailable':
        return setStep({ kind: 'unavailable' });
      case 'offline':
        return setStep({ kind: 'offline' });
      default:
        return setStep(onUnexpected);
    }
  }, []);

  if (!authorized) {
    return <ConfirmPersonScreen view={{ kind: 'unauthorized', athleteName, onGoToAuthorizations }} onBack={onBack} />;
  }
  if (!online) return <ConfirmPersonScreen view={{ kind: 'offline' }} onBack={onBack} />;
  if (loaded.status === 'loading') return <ConfirmPersonScreen view={{ kind: 'loading' }} onBack={onBack} />;
  if (loaded.status === 'no_source') return <ConfirmPersonScreen view={{ kind: 'unavailable' }} onBack={onBack} />;
  if (loaded.status === 'error') {
    return <ConfirmPersonScreen view={{ kind: 'loading_error', onRetry: () => setAttempt((n) => n + 1) }} onBack={onBack} />;
  }

  const { source, hint } = loaded;
  const organizationId = source.organizationId;

  async function runSearch() {
    const outcome = await search.search({ athleteId: athlete.id, organizationId, firstName: athlete.firstName.trim(), lastName: athlete.lastName.trim() });
    if (!outcome.ok) return fail(outcome.error, { kind: 'start', message: t('results_import.errors.unexpected') });
    setStep(outcome.value.length === 0 ? { kind: 'empty' } : { kind: 'candidates', candidates: outcome.value });
  }

  // Not a hook: `busy` guards a second press while the first request is out.
  async function guarded(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  const goToStart = (message?: string) => setStep({ kind: 'start', message });

  const view = ((): ConfirmPersonView => {
    switch (step.kind) {
      case 'start':
        return {
          kind: 'start',
          athleteName,
          sourceName: source.name,
          hint,
          number,
          numberInvalid,
          busy,
          message: step.message,
          onChangeNumber: (text) => {
            setNumber(text);
            setNumberInvalid(false);
          },
          onSearchStored: () => void guarded(runSearch),
          onSearchByName: () => void guarded(runSearch),
          onSaveAndSearch: () =>
            void guarded(async () => {
              const identityNumber = normalizeIdentityNumber(number);
              // An empty field is "no number": the search goes by name and nothing is saved.
              if (identityNumber !== '') {
                if (!isValidIdentityNumber(identityNumber)) return setNumberInvalid(true);
                try {
                  await identityDocuments.save({ athleteId: athlete.id, identityNumber });
                } catch {
                  return goToStart(t('results_import.errors.save_failed'));
                }
                // Saved: the screen does not keep it any longer.
                setNumber('');
              }
              await runSearch();
            }),
        };
      case 'candidates':
        return {
          kind: 'candidates',
          athleteName,
          sourceName: source.name,
          candidates: step.candidates,
          confirmingId,
          onNone: () => goToStart(),
          onConfirm: (candidateId) =>
            void guarded(async () => {
              setConfirmingId(candidateId);
              try {
                const outcome = await search.confirm({ athleteId: athlete.id, organizationId, candidateId });
                if (outcome.ok) return setStep({ kind: 'confirmed' });
                if (outcome.error.code === 'unknown_id') return goToStart(t('results_import.errors.expired'));
                if (outcome.error.code === 'identity_number_conflict') return goToStart(t('results_import.errors.number_conflict'));
                fail(outcome.error, { kind: 'candidates', candidates: step.candidates });
              } finally {
                setConfirmingId(null);
              }
            }),
        };
      case 'empty':
        return { kind: 'empty', athleteName, sourceName: source.name, onRetry: () => goToStart() };
      case 'confirmed':
        return { kind: 'confirmed', athleteName, sourceName: source.name, onDone };
      case 'rate_limited':
        return { kind: 'rate_limited', time: formatRetryTime(step.retryAt) };
      case 'unauthorized':
        return { kind: 'unauthorized', athleteName, onGoToAuthorizations };
      case 'unavailable':
        return { kind: 'unavailable' };
      case 'offline':
        return { kind: 'offline' };
    }
  })();

  return <ConfirmPersonScreen view={view} onBack={onBack} />;
}
