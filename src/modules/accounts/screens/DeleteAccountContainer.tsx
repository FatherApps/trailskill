import { useRef, useState } from 'react';

import { useSession } from '../../../core/session';
import type { AccountDeletionFailure, AccountDeletionRepository } from '../data/accountDeletion';
import type { PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { DeleteAccountScreen, type DeleteAccountError, type DeleteAccountView } from './DeleteAccountScreen';

/** The call point of the export of the person's data (its own issue): the offer shows the button only when one is given. */
export interface AccountExporter {
  /** Rejects when the data could not be exported. */
  export(): Promise<void>;
}

export type DeleteAccountContainerProps = {
  repository: AccountDeletionRepository;
  // No signal: nothing goes to the server and the screen says so.
  online: boolean;
  exporter?: AccountExporter;
  // Cleared with the session, as in the sign-out button: the next person on this phone must not find them.
  drafts: RegistrationDraftRepository;
  pending: PendingInvitationRepository;
  onBack: () => void;
};

const CODE_LENGTH = 6;

type Busy = NonNullable<React.ComponentProps<typeof DeleteAccountScreen>['busy']>;

// "Eliminar mis datos": offer to export, the notice, the emailed code, and the date the server set. The server decides who may delete
// (a school link, a platform admin); this screen only shows its answer. Confirming ends the session through the session provider, which
// also empties the local database.
export function DeleteAccountContainer({ repository, online, exporter, drafts, pending, onBack }: DeleteAccountContainerProps) {
  const { session, signOut } = useSession();
  const userId = session?.user.id;
  const [view, setView] = useState<DeleteAccountView>({ step: 'offer', canExport: exporter !== undefined });
  const [busy, setBusy] = useState<Busy>();
  // State updates land after the render: a ref blocks a second press made before the loading state shows.
  const inFlight = useRef(false);

  async function run(kind: Busy, work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(undefined);
    }
  }

  // A refusal that ends the flow, or the error to show on the step that asked.
  function refused(error: AccountDeletionFailure, stay: (error: DeleteAccountError) => DeleteAccountView) {
    if (error.code === 'blocked_by_school') setView({ step: 'blocked', schools: error.schools.map((school) => school.name) });
    else if (error.code === 'platform_admin') setView({ step: 'admin' });
    else setView(stay(error.code));
  }

  const onExport = () =>
    online && exporter
      ? run('exporting', () =>
          exporter.export().then(
            () => setView({ step: 'offer', canExport: true }),
            () => setView({ step: 'offer', canExport: true, exportFailed: true }),
          ),
        )
      : undefined;

  const onRequestCode = () => {
    if (!online) return;
    const onCodeStep = view.step === 'code';
    return run('requesting', async () => {
      const outcome = await repository.request();
      if (!outcome.ok) return refused(outcome.error, (error) => (onCodeStep ? { step: 'code', code: view.step === 'code' ? view.code : '', error } : { step: 'notice', error }));
      if (outcome.value.status === 'already_marked') setView({ step: 'done', deleteAfter: outcome.value.deleteAfter });
      else setView({ step: 'code', code: '', emailNotSent: !outcome.value.emailSent });
    });
  };

  const onConfirm = () => {
    if (!online || view.step !== 'code' || view.code.length !== CODE_LENGTH) return;
    const { code } = view;
    return run('confirming', async () => {
      const outcome = await repository.confirm(code);
      if (!outcome.ok) return refused(outcome.error, (error) => ({ step: 'code', code, error }));
      setView({ step: 'done', deleteAfter: outcome.value.deleteAfter });
    });
  };

  const onLeave = () => {
    if (view.step !== 'done') return;
    const { deleteAfter } = view;
    return run('leaving', async () => {
      try {
        // Forced: the notice already said that what was not sent is lost.
        await signOut({ force: true });
        await Promise.all([drafts.clear(), userId ? pending.clear(userId) : undefined].map((cleared) => cleared?.catch(() => {})));
      } catch {
        setView({ step: 'done', deleteAfter, leaveFailed: true });
      }
    });
  };

  return (
    <DeleteAccountScreen
      view={view}
      online={online}
      busy={busy}
      onExport={() => void onExport()}
      onContinue={() => setView({ step: 'notice' })}
      onRequestCode={() => void onRequestCode()}
      onChangeCode={(code) => view.step === 'code' && setView({ ...view, code, error: undefined })}
      onConfirm={() => void onConfirm()}
      onLeave={() => void onLeave()}
      onBack={onBack}
    />
  );
}
