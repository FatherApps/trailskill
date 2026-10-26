import { useCallback, useEffect, useState } from 'react';

import { ConflictReviewError, type ConflictFailure, type ConflictReviewRepository, type OpenConflict, type ResolveConflictInput } from '../data/conflictReview';
import { ReviewConflictsScreen } from './ReviewConflictsScreen';

export type ReviewConflictsFlowProps = {
  repository: ConflictReviewRepository;
  userId: string | undefined;
  // The device has no connection: resolving needs the server.
  offline: boolean;
  onDenied: () => void;
  onBack: () => void;
};

// Only a platform admin sees the conflicts; the server function checks the role again on every resolution.
export function ReviewConflictsFlow({ repository, userId, offline, onDenied, onBack }: ReviewConflictsFlowProps) {
  const [view, setView] = useState<'loading' | 'error' | 'ready'>('loading');
  const [conflicts, setConflicts] = useState<OpenConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ConflictFailure | null>(null);
  // A resolution that never reached the server tells the screen it is offline even when the sync status has not noticed yet.
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    try {
      setConflicts(await repository.listOpen());
      setView('ready');
    } catch {
      setView('error');
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      onDenied();
      return;
    }
    repository
      .isPlatformAdmin(userId)
      .catch(() => false)
      .then((admin) => {
        if (!active) return;
        if (admin) void load();
        else onDenied();
      });
    return () => {
      active = false;
    };
    // `onDenied` is a navigation callback: asking again when it changes identity would reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, userId, load]);

  async function resolve(input: ResolveConflictInput) {
    setBusy(true);
    setFailure(null);
    setUnreachable(false);
    try {
      await repository.resolve(input);
      await load();
    } catch (error) {
      const reason = error instanceof ConflictReviewError ? error.reason : 'failed';
      if (reason === 'offline') setUnreachable(true);
      else setFailure(reason);
      // A changed or already resolved conflict is read again, so the next attempt carries the new version.
      if (reason === 'stale' || reason === 'resolved') await load();
    } finally {
      setBusy(false);
    }
  }

  const retry = () => {
    setView('loading');
    void load();
  };

  return (
    <ReviewConflictsScreen
      view={view === 'ready' && conflicts.length === 0 ? 'empty' : view}
      conflicts={conflicts}
      offline={offline || unreachable}
      busy={busy}
      failure={failure}
      onResolve={resolve}
      onRetry={retry}
      onBack={onBack}
    />
  );
}
