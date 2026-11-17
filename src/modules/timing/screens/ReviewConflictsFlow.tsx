import { useCallback, useEffect, useState } from 'react';

import { ConflictReviewError, type ConflictFailure, type ConflictReviewRepository, type OpenConflict, type ResolveConflictInput } from '../data/conflictReview';
import { ReviewConflictsScreen } from './ReviewConflictsScreen';

export type ReviewConflictsFlowProps = {
  repository: ConflictReviewRepository;
  userId: string | undefined;
  // Whether the user is staff of a school ('loading' while that is looked up). Staff read the conflicts of their school; the server limits them.
  staff: boolean | 'loading';
  // The device has no connection: resolving needs the server.
  offline: boolean;
  onDenied: () => void;
  onBack: () => void;
};

// A platform admin reads and resolves the conflicts; school staff only read them. The server decides what each one reads and checks the role again on every resolution.
export function ReviewConflictsFlow({ repository, userId, staff, offline, onDenied, onBack }: ReviewConflictsFlowProps) {
  const [view, setView] = useState<'loading' | 'error' | 'ready'>('loading');
  const [conflicts, setConflicts] = useState<OpenConflict[]>([]);
  const [canResolve, setCanResolve] = useState(false);
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
    if (staff === 'loading') return;
    repository
      .isPlatformAdmin(userId)
      .catch(() => false)
      .then((admin) => {
        if (!active) return;
        setCanResolve(admin);
        if (admin || staff) void load();
        else onDenied();
      });
    return () => {
      active = false;
    };
    // `onDenied` is a navigation callback: asking again when it changes identity would reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, userId, staff, load]);

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
      canResolve={canResolve}
      failure={failure}
      onResolve={resolve}
      onRetry={retry}
      onBack={onBack}
    />
  );
}
