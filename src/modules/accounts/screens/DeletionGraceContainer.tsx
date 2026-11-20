import { useRef, useState } from 'react';

import type { AccountDeletionRepository } from '../data/accountDeletion';
import { DeletionGraceScreen } from './DeletionGraceScreen';

export type DeletionGraceContainerProps = {
  repository: AccountDeletionRepository;
  deleteAfter: string;
  online: boolean;
  // The mark is off (or was never on): the app goes back to its normal screens and syncs again.
  onCancelled: () => void;
};

export function DeletionGraceContainer({ repository, deleteAfter, online, onCancelled }: DeletionGraceContainerProps) {
  const [cancelling, setCancelling] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  async function cancel() {
    // Without signal nothing is sent; the screen already says so.
    if (!online || inFlight.current) return;
    inFlight.current = true;
    setCancelling(true);
    setFailed(false);
    try {
      const outcome = await repository.cancel();
      if (outcome.ok) onCancelled();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setCancelling(false);
    }
  }

  return <DeletionGraceScreen deleteAfter={deleteAfter} online={online} cancelling={cancelling} failed={failed} onCancel={() => void cancel()} />;
}
