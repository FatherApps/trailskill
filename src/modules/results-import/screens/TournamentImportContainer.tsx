import { useCallback, useEffect, useMemo, useState } from 'react';

import { isValidIdentityNumber, normalizeIdentityNumber, type IdentityDocumentRepository } from '../../accounts';
import { t } from '../../../core/i18n';
import type { OfficialResultsService } from '../data/officialResults';
import type { ImportSource, ImportSourcesRepository, OfficialSearchRepository, SearchFailure, TournamentCandidate } from '../data/officialSearch';
import '../i18n';
import { formatRetryTime } from './ConfirmPersonContainer';
import { ConfirmPersonScreen, type ConfirmPersonView, type NumberHint } from './ConfirmPersonScreen';

export type TournamentImportContainerProps = {
  athlete: { id: string; firstName: string };
  // import_official_results in force for this athlete, decided by the route.
  authorized: boolean;
  online: boolean;
  sources: ImportSourcesRepository;
  search: OfficialSearchRepository;
  results: Pick<OfficialResultsService, 'importChosen'>;
  identityDocuments: Pick<IdentityDocumentRepository, 'hint'>;
  onGoToAuthorizations: () => void;
  onDone: () => void;
  onBack: () => void;
};

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; sources: ImportSource[]; hint: NumberHint };

type Step =
  | { kind: 'start'; message?: string }
  // The server found the person in the tournament: nothing is saved until the guardian confirms.
  | { kind: 'candidate'; organizationId: string; candidate: TournamentCandidate }
  | { kind: 'empty' }
  | { kind: 'done'; imported: number }
  // Confirmed, but saving the offered results failed: retrying repeats only the import.
  | { kind: 'import_failed'; offered: string[] }
  | { kind: 'rate_limited'; retryAt: string }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
  | { kind: 'offline' };

const URL_MAX_LENGTH = 500;

// The address of one tournament of a results platform: the guardian pastes it, the server decides which platform it belongs to.
// "Is this person?" is asked for each tournament, and only after the guardian answers yes are its results imported.
export function TournamentImportContainer({
  athlete,
  authorized,
  online,
  sources,
  search,
  results,
  identityDocuments,
  onGoToAuthorizations,
  onDone,
  onBack,
}: TournamentImportContainerProps) {
  const [answer, setAnswer] = useState<{ key: string; result: Loaded }>();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [url, setUrl] = useState('');
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
    Promise.all([sources.list(), identityDocuments.hint(athlete.id)]).then(
      ([list, hint]) => current && setAnswer({ key: requestKey, result: { status: 'ready', sources: list, hint } }),
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
        return setStep({ kind: 'start', message: t('results_import.errors.tournament_unknown') });
      case 'identity_number_required':
        return setStep({ kind: 'start', message: t('results_import.errors.number_required') });
      case 'identity_number_conflict':
        return setStep({ kind: 'start', message: t('results_import.errors.number_conflict') });
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
  if (loaded.status === 'error') {
    return <ConfirmPersonScreen view={{ kind: 'loading_error', onRetry: () => setAttempt((n) => n + 1) }} onBack={onBack} />;
  }

  const { hint } = loaded;
  // The name comes from the platform's organization row; the address alone never names it.
  const nameOf = (organizationId: string) => loaded.sources.find((source) => source.organizationId === organizationId)?.name ?? t('results_import.tournament.generic_source');

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

  async function runSearch() {
    const address = url.trim();
    if (address === '' || address.length > URL_MAX_LENGTH) return setStep({ kind: 'start', message: t('results_import.errors.tournament_unknown') });
    // The number is sent with the request only when none is saved; the server keeps it once the person is confirmed.
    let identityNumber: string | undefined;
    if (!hint.present) {
      const typed = normalizeIdentityNumber(number);
      if (typed === '') return setStep({ kind: 'start', message: t('results_import.errors.number_required') });
      if (!isValidIdentityNumber(typed)) return setNumberInvalid(true);
      identityNumber = typed;
    }
    const outcome = await search.tournament({ athleteId: athlete.id, url: address, ...(identityNumber ? { identityNumber } : {}) });
    if (!outcome.ok) return fail(outcome.error, { kind: 'start', message: t('results_import.errors.unexpected') });
    // Found or not, the typed number is no longer needed on the screen.
    setNumber('');
    const { organizationId, candidate } = outcome.value;
    setStep(candidate ? { kind: 'candidate', organizationId, candidate } : { kind: 'empty' });
  }

  async function confirm(organizationId: string, candidate: TournamentCandidate) {
    setConfirmingId(candidate.id);
    try {
      const confirmed = await search.confirmTournament({ athleteId: athlete.id, organizationId, candidateId: candidate.id });
      if (!confirmed.ok) {
        if (confirmed.error.code === 'unknown_id') return setStep({ kind: 'start', message: t('results_import.errors.expired') });
        return fail(confirmed.error, { kind: 'candidate', organizationId, candidate });
      }
      // Only now, after "Is this person?" was answered yes, is anything saved: exactly the results the server offered for this person.
      const offered = confirmed.value.map((result) => result.id);
      if (offered.length === 0) return setStep({ kind: 'done', imported: 0 });
      await importOffered(offered);
    } finally {
      setConfirmingId(null);
    }
  }

  async function importOffered(offered: string[]) {
    const imported = await results.importChosen(athlete.id, offered);
    if (!imported.ok) return setStep(imported.error.code === 'not_authorized' ? { kind: 'unauthorized' } : { kind: 'import_failed', offered });
    setStep({ kind: 'done', imported: imported.value.inserted });
  }

  const goToStart = () => setStep({ kind: 'start' });

  const view = ((): ConfirmPersonView => {
    switch (step.kind) {
      case 'start':
        return {
          kind: 'tournament_start',
          athleteName,
          hint,
          url,
          number,
          numberInvalid,
          busy,
          message: step.message,
          onChangeUrl: setUrl,
          onChangeNumber: (text) => {
            setNumber(text);
            setNumberInvalid(false);
          },
          onSearch: () => void guarded(runSearch),
        };
      case 'candidate':
        return {
          kind: 'candidates',
          athleteName,
          sourceName: nameOf(step.organizationId),
          // Only the name and the club of the person found in this tournament: no birth date reaches the device.
          candidates: [
            {
              id: step.candidate.id,
              name: step.candidate.name,
              affiliations: [{ club: step.candidate.club, league: null, years: [] }],
              resultCount: step.candidate.resultCount,
            },
          ],
          confirmingId,
          onNone: goToStart,
          onConfirm: () => void guarded(() => confirm(step.organizationId, step.candidate)),
        };
      case 'empty':
        return { kind: 'tournament_empty', athleteName, onRetry: goToStart };
      case 'done':
        return { kind: 'tournament_done', athleteName, imported: step.imported, onDone };
      case 'import_failed':
        return { kind: 'tournament_import_failed', onRetry: () => void guarded(() => importOffered(step.offered)) };
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
