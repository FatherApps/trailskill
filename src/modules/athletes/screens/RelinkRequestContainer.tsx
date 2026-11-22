import { useCallback, useEffect, useRef, useState } from 'react';

import type { AthleteRelinkRepository, RelinkRequest } from '../data/athleteRelink';
import { RelinkRequestScreen, type RelinkRequestState, type RelinkRequestsView } from './RelinkRequestScreen';

export type RelinkRequestContainerProps = {
  athleteId: string;
  athleteName: string;
  repository: AthleteRelinkRepository;
  onBack: () => void;
};

// Asks the server (online only) and shows what the school answered. The key stays in this component's state only until it is sent: it is
// cleared as soon as the server answers, whatever the answer, and never written anywhere.
export function RelinkRequestContainer({ athleteId, athleteName, repository, onBack }: RelinkRequestContainerProps) {
  const [keyValue, setKeyValue] = useState('');
  const [state, setState] = useState<RelinkRequestState>('idle');
  const [list, setList] = useState<RelinkRequest[] | 'loading' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  // A ref, not state: a second press can arrive before a re-render shows the first is running.
  const sending = useRef(false);

  useEffect(() => {
    let active = true;
    repository.listForAthlete(athleteId).then(
      (requests) => active && setList(requests),
      () => active && setList('error'),
    );
    return () => {
      active = false;
    };
  }, [repository, athleteId, reload]);

  const submit = useCallback(async () => {
    if (sending.current || keyValue.trim().length === 0) return;
    sending.current = true;
    setState('sending');
    try {
      const answer = await repository.request(athleteId, keyValue);
      setState(answer);
      // A right key is spent; a wrong one is typed again. Neither stays on screen.
      setKeyValue('');
      setReload((n) => n + 1);
    } catch {
      setState('error');
    } finally {
      sending.current = false;
    }
  }, [repository, athleteId, keyValue]);

  const requests: RelinkRequestsView =
    list === 'loading'
      ? { kind: 'loading' }
      : list === 'error'
        ? { kind: 'error', onRetry: () => (setList('loading'), setReload((n) => n + 1)) }
        : { kind: 'ready', requests: list };

  return (
    <RelinkRequestScreen
      athleteId={athleteId}
      athleteName={athleteName}
      keyValue={keyValue}
      onChangeKey={(value) => {
        setKeyValue(value);
        if (state !== 'sending') setState('idle');
      }}
      state={state}
      requests={requests}
      onSubmit={() => void submit()}
      onBack={onBack}
    />
  );
}
