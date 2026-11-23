import { useState } from 'react';
import { Modal, Share } from 'react-native';

import type { ManagedAthleteRepository } from '../../accounts';
import type { AthleteRecoveryCodeRepository } from '../data/athleteRecoveryCodes';
import type { RecoveryCodeVault } from '../data/recoveryCodeVault';
import type { SchoolAthleteRepository } from '../data/schoolAthletes';
import { useManagedAthletes } from '../data/useManagedAthletes';
import { useRecoveryCodeNotices } from '../data/useRecoveryCodeNotices';
import { RecoveryCodesReplacedScreen } from './RecoveryCodesReplacedScreen';
import { RecoveryCodesScreen, recoveryCodesText } from './RecoveryCodesScreen';

export type RecoveryCodesNoticeContainerProps = {
  repository: AthleteRecoveryCodeRepository;
  vault: RecoveryCodeVault;
  userId: string | undefined;
  // The swimmers the user manages, as the route already knows them.
  athletes: readonly { id: string; firstName: string }[];
  online: boolean;
  // Injected by tests; otherwise the system share sheet, which also copies.
  share?: (message: string) => Promise<unknown>;
};

const defaultShare = (message: string) => Share.share({ message });

// The single notice with the codes of a swimmer the user manages, over whatever screen is open. It has no way out but «Ya los guardé»:
// the server never gives these texts again.
export function RecoveryCodesNoticeContainer({ repository, vault, userId, athletes, online, share = defaultShare }: RecoveryCodesNoticeContainerProps) {
  const { notice, acknowledge } = useRecoveryCodeNotices({ repository, vault, userId, athletes, online });
  const [state, setState] = useState<{ athleteId: string; status: 'saving' | 'error' }>();
  if (!notice) return null;
  const status = state?.athleteId === notice.athleteId ? state.status : undefined;

  async function done() {
    if (!notice) return;
    setState({ athleteId: notice.athleteId, status: 'saving' });
    try {
      await acknowledge(notice);
      setState(undefined);
    } catch {
      setState({ athleteId: notice.athleteId, status: 'error' });
    }
  }

  return (
    // The hardware back button does nothing: leaving without saving the codes would lose them.
    <Modal visible animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      {notice.kind === 'replaced_elsewhere' ? (
        <RecoveryCodesReplacedScreen athleteName={notice.athleteName} onDone={done} />
      ) : (
      <RecoveryCodesScreen
        athleteName={notice.athleteName}
        mainCode={notice.mainCode}
        recoveryCodes={notice.recoveryCodes}
        replacing={notice.replacesPrevious}
        saving={status === 'saving'}
        error={status === 'error'}
        onCopy={() => share(recoveryCodesText({ athleteName: notice.athleteName, mainCode: notice.mainCode, recoveryCodes: notice.recoveryCodes })).catch(() => {})}
        onDone={done}
      />
      )}
    </Modal>
  );
}

export type ManagedRecoveryCodesNoticeProps = Omit<RecoveryCodesNoticeContainerProps, 'athletes'> & {
  managed: ManagedAthleteRepository;
  athletes: SchoolAthleteRepository;
  // A new value looks at the managed swimmers again.
  refreshKey?: unknown;
};

// The notice for whoever is signed in: it reads the swimmers they manage itself (none for school staff, so nothing is asked for them).
export function ManagedRecoveryCodesNotice({ managed, athletes, refreshKey, ...rest }: ManagedRecoveryCodesNoticeProps) {
  const found = useManagedAthletes(managed, athletes, rest.userId, refreshKey);
  return <RecoveryCodesNoticeContainer {...rest} athletes={found.status === 'ready' ? found.athletes : []} />;
}
