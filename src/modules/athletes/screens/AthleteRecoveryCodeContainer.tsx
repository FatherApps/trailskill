import { useEffect, useState } from 'react';
import { Modal, Share } from 'react-native';

import { namedText, t } from '../../../core/i18n';
import { ConfirmSheet } from '../../../core/ui';
import { AthleteRecoveryCodeRow } from '../components/AthleteRecoveryCodeRow';
import type { AthleteRecoveryCodeRepository } from '../data/athleteRecoveryCodes';
import type { RecoveryCodeVault } from '../data/recoveryCodeVault';
import '../i18n';
import { RecoveryCodesScreen, recoveryCodesText } from './RecoveryCodesScreen';

export type AthleteRecoveryCodeContainerProps = {
  athleteId: string;
  athleteName: string;
  userId: string | undefined;
  repository: AthleteRecoveryCodeRepository;
  vault: RecoveryCodeVault;
  // A new set of recovery codes comes from the server: without signal it is not offered.
  online: boolean;
  // Injected by tests; otherwise the system share sheet, which also copies.
  share?: (message: string) => Promise<unknown>;
};

const defaultShare = (message: string) => Share.share({ message });

type Saved = { key: string; code: string | null };

// «Código principal» on the swimmer's profile: the permanent code shows only when the owner taps, and only from this phone's vault
// (the server never knows the text). The route passes this only to who manages the swimmer, never to school staff or other families.
export function AthleteRecoveryCodeContainer({ athleteId, athleteName, userId, repository, vault, online, share = defaultShare }: AthleteRecoveryCodeContainerProps) {
  const key = `${userId}:${athleteId}`;
  const [saved, setSaved] = useState<Saved>();
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [newSet, setNewSet] = useState<string[]>();
  const [problem, setProblem] = useState<'unused' | 'error'>();

  useEffect(() => {
    let active = true;
    if (userId) {
      vault.get(userId, athleteId).then(
        (code) => active && setSaved({ key, code }),
        () => active && setSaved({ key, code: null }),
      );
    }
    return () => {
      active = false;
    };
  }, [vault, userId, athleteId, key]);

  // Only this swimmer's own answer counts: a read of another one never shows here.
  const code = saved?.key === key ? saved.code : undefined;

  async function regenerate() {
    setConfirming(false);
    try {
      setNewSet(await repository.regenerate(athleteId));
      setProblem(undefined);
    } catch (error) {
      setProblem(error instanceof Error && error.message === 'no_recovery_code_used' ? 'unused' : 'error');
    }
  }

  return (
    <>
      <AthleteRecoveryCodeRow
        code={code}
        revealed={revealed}
        online={online}
        problem={problem}
        onToggle={() => setRevealed((shown) => !shown)}
        onCopy={() => code && share(namedText('athletes.recovery_code.copy_message', athleteName, { code })).catch(() => {})}
        onRegenerate={() => {
          setConfirming(true);
          setProblem(undefined);
        }}
      />
      <ConfirmSheet
        visible={confirming}
        title={t('athletes.recovery_code.regenerate_title')}
        message={t('athletes.recovery_code.regenerate_message')}
        confirmLabel={t('athletes.recovery_code.regenerate_confirm')}
        cancelLabel={t('athletes.recovery_code.regenerate_cancel')}
        destructive
        onConfirm={regenerate}
        onCancel={() => setConfirming(false)}
      />
      {/* The new set shows once; the hardware back button does nothing so it is not closed before the owner saved it. */}
      <Modal visible={!!newSet} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
        {newSet && (
          <RecoveryCodesScreen
            athleteName={athleteName}
            recoveryCodes={newSet}
            onCopy={() => share(recoveryCodesText({ athleteName, recoveryCodes: newSet })).catch(() => {})}
            onDone={() => setNewSet(undefined)}
          />
        )}
      </Modal>
    </>
  );
}
