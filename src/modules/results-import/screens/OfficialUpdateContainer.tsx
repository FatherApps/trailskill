import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../core/theme';
import type { AuthorizationStatusRepository } from '../../accounts';
import { formatDate } from '../../athletes';
import { eventLabel } from '../components/eventLabel';
import { OfficialUpdateButton } from '../components/OfficialUpdateButton';
import type { ImportedResult, ImportedResultsRepository, PendingResultChange } from '../data/importedResults';
import type { FoundResult, IdentityConfirmation, PendingChangeResolver } from '../data/officialResults';
import { updateButtonState, type CheckOutcome, type createOfficialUpdate } from '../officialUpdate';
import { OfficialResultsScreen, type ChangeItem, type ImportNotice, type OfficialResultsView } from './OfficialResultsScreen';

export type OfficialUpdateContainerProps = {
  athleteId: string;
  update: ReturnType<typeof createOfficialUpdate>;
  repository: ImportedResultsRepository;
  identity: IdentityConfirmation;
  authorizations: Pick<AuthorizationStatusRepository, 'listGrantedAthleteIds'>;
  resolver: PendingChangeResolver;
  // Changes when a sync finishes, so differences the server recorded show up without reopening the profile.
  syncKey?: number;
};

type Loaded = { identityConfirmed: boolean; authorized: boolean; lastImportedAt: string | null; imported: ImportedResult[]; pending: PendingResultChange[] };

const shortDate = (iso: string) => formatDate(iso.slice(0, 10), 'short') ?? '';
const clock = (iso: string) => {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

function toView(outcome: CheckOutcome, handlers: { retry: () => void; toggle: (id: string) => void; submit: () => void; dismiss: () => void }, state: { selected: string[]; importing: boolean }): OfficialResultsView {
  switch (outcome.kind) {
    case 'none':
      return { kind: 'none' };
    case 'unavailable':
      return { kind: 'unavailable', onRetry: handlers.retry };
    case 'rate_limited':
      return { kind: 'rate_limited', retryAt: clock(outcome.retryAt) };
    case 'found':
      return {
        kind: 'list',
        items: outcome.results.map((r) => ({ id: r.id, event: eventLabel(r.stroke, r.distance, r.pool), date: shortDate(r.swumOn), competition: r.competition, time: r.hundredths })),
        selectedIds: state.selected,
        importing: state.importing,
        onToggle: handlers.toggle,
        onImport: handlers.submit,
        onDismiss: handlers.dismiss,
      };
  }
}

// Connects the update button and the results panel to the server, the local database and the guardian's choices.
export function OfficialUpdateContainer({ athleteId, update, repository, identity, authorizations, resolver, syncKey }: OfficialUpdateContainerProps) {
  const { space } = useTheme();
  const [loaded, setLoaded] = useState<Loaded>();
  const [outcome, setOutcome] = useState<CheckOutcome>();
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<ImportNotice>();
  // Changes the guardian answered (hidden at once) and the ones whose answer could not be saved.
  const [answered, setAnswered] = useState<string[]>([]);
  const [failedChange, setFailedChange] = useState<string>();
  const [busyChange, setBusyChange] = useState<string>();

  const load = useCallback(async () => {
    const [identityConfirmed, granted, lastImportedAt, imported, pending] = await Promise.all([
      identity.isConfirmed(athleteId),
      authorizations.listGrantedAthleteIds('import_official_results'),
      repository.lastImportedAt(athleteId),
      repository.listByAthlete(athleteId),
      repository.listPendingChanges(athleteId),
    ]);
    setLoaded({ identityConfirmed, authorized: granted.includes(athleteId), lastImportedAt, imported, pending });
  }, [athleteId, identity, authorizations, repository]);

  // A failed read leaves the button hidden: nothing is offered that cannot be checked.
  useEffect(() => {
    load().catch(() => setLoaded(undefined));
  }, [load, syncKey]);

  const check = useCallback(async () => {
    setChecking(true);
    setNotice(undefined);
    const result = await update.check(athleteId);
    setOutcome(result);
    setSelected(result.kind === 'found' ? result.results.map((r) => r.id) : []);
    setChecking(false);
  }, [update, athleteId]);

  const toggle = useCallback((id: string) => setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id])), []);
  const dismiss = useCallback(() => setOutcome(undefined), []);

  const submit = useCallback(async () => {
    if (outcome?.kind !== 'found') return;
    const chosen: FoundResult[] = outcome.results.filter((r) => selected.includes(r.id));
    setImporting(true);
    const result = await update.importChosen(athleteId, chosen);
    setImporting(false);
    if (result.kind === 'expired') {
      // The server forgot the list: ask again and let the guardian choose anew.
      await check();
      setNotice('expired');
    } else if (result.kind === 'failed') {
      setNotice('failed');
    } else {
      setOutcome(undefined);
      setNotice({ inserted: result.inserted, changes: result.changes });
      await load().catch(() => {});
    }
  }, [outcome, selected, update, athleteId, check, load]);

  const answer = useCallback(
    async (changeId: string, choice: 'use_new' | 'keep_current') => {
      setBusyChange(changeId);
      setFailedChange(undefined);
      const saved = await resolver.resolve(changeId, choice);
      setBusyChange(undefined);
      if (saved) setAnswered((now) => [...now, changeId]);
      else setFailedChange(changeId);
    },
    [resolver],
  );

  const changes = useMemo<ChangeItem[]>(() => {
    if (!loaded?.authorized) return [];
    const currentById = new Map(loaded.imported.map((r) => [r.id, r]));
    return loaded.pending
      .filter((c) => !answered.includes(c.id))
      .map((c) => ({
        id: c.id,
        event: eventLabel(c.stroke, c.distance, c.pool),
        date: shortDate(c.swumOn),
        // The value imported before stays on screen until the guardian chooses.
        current: currentById.get(c.importedResultId)?.hundredths ?? null,
        proposed: c.hundredths,
        busy: busyChange === c.id,
        failed: failedChange === c.id,
      }));
  }, [loaded, answered, busyChange, failedChange]);

  const button = updateButtonState({
    identityConfirmed: loaded?.identityConfirmed ?? false,
    authorized: loaded?.authorized ?? false,
    checking,
    lastUpdatedAt: loaded?.lastImportedAt ?? null,
  });
  if (!button.visible) return null;

  const view: OfficialResultsView = checking
    ? { kind: 'checking' }
    : outcome
      ? toView(outcome, { retry: check, toggle, submit, dismiss }, { selected, importing })
      : { kind: 'idle' };

  return (
    <View style={{ alignSelf: 'stretch', gap: space[3] }}>
      <OfficialUpdateButton checking={button.disabled} lastUpdated={button.lastUpdatedAt ? shortDate(button.lastUpdatedAt) : null} onPress={check} />
      <OfficialResultsScreen
        view={view}
        notice={notice}
        changes={changes}
        onUseNew={(id) => answer(id, 'use_new')}
        onKeepCurrent={(id) => answer(id, 'keep_current')}
      />
    </View>
  );
}
