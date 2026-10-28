import { useState } from 'react';

import type { Provider } from '../components/ProviderButton';
import type { InvitationRepository } from '../data/invitations';
import { sameEmail } from '../data/profileGate';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import {
  ProviderRegistrationScreen,
  type ProviderRegistrationField,
  type ProviderRegistrationScreenProps,
} from './ProviderRegistrationScreen';
import { useInvitation } from './useInvitation';
import type { SwimmerChoice } from './WhoSwimsScreen';

// What the signed-in session already says about the person. The names are only a suggestion the person can correct.
export type ProviderAccount = { email: string; provider?: Provider; firstName: string; lastName: string };

type SessionUser = { email?: string; app_metadata?: { provider?: string }; user_metadata?: Record<string, unknown> };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function providerAccountOf(user: SessionUser): ProviderAccount {
  const meta = user.user_metadata ?? {};
  const [firstOfFull = '', ...restOfFull] = (text(meta.full_name) || text(meta.name)).split(/\s+/);
  const provider = user.app_metadata?.provider;
  return {
    email: user.email ?? '',
    provider: provider === 'google' ? 'google' : provider === 'azure' ? 'microsoft' : undefined,
    firstName: text(meta.given_name) || firstOfFull,
    lastName: text(meta.family_name) || restOfFull.join(' '),
  };
}

export type ProviderRegistrationContainerProps = {
  account: ProviderAccount;
  drafts: RegistrationDraftRepository;
  invitations: InvitationRepository;
  // The draft is saved: the profile is stored and the next step opens from it, as after the code.
  onSaved: () => void;
  onBack?: () => void;
  // Leaving did not work (signing out failed): the screen says so instead of staying still.
  exitFailed?: boolean;
};

type Errors = NonNullable<ProviderRegistrationScreenProps['errors']>;

// Registers an account whose email the provider already verified. It saves the same draft the code flow leaves behind
// (with the code marked as checked), so the profile, the next step and the authorizations are the ones that already exist.
export function ProviderRegistrationContainer({ account, drafts, invitations, onSaved, onBack, exitFailed }: ProviderRegistrationContainerProps) {
  const [swimmer, setSwimmer] = useState<SwimmerChoice>();
  const [values, setValues] = useState({ firstName: account.firstName, lastName: account.lastName });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { invitation, invalid } = useInvitation(drafts, invitations);

  function change(field: ProviderRegistrationField, value: string) {
    setValues((typed) => ({ ...typed, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    if (busy) return;
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const found: Errors = {};
    if (!swimmer) found.swimmer = 'required';
    if (!firstName) found.firstName = 'required';
    if (!lastName) found.lastName = 'required';
    setErrors(found);
    if (!swimmer || !firstName || !lastName) return;
    setBusy(true);
    setFailed(false);
    try {
      // The token is read from the store: the invitation check may have just cleared it. Only a draft typed for this email lends its token:
      // on a shared phone the one left by someone else is not this person's invitation.
      const stored = await drafts.load().catch(() => null);
      const invitationToken = stored && sameEmail(stored.email, account.email) ? stored.invitationToken : undefined;
      await drafts.save({ swimmer, firstName, lastName, email: account.email, codeRequested: true, invitationToken });
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderRegistrationScreen
      email={account.email}
      provider={account.provider}
      swimmer={swimmer}
      values={values}
      errors={errors}
      busy={busy}
      failed={failed}
      invitation={invitation}
      invalidInvitation={invalid}
      onSelect={(choice) => {
        setSwimmer(choice);
        setErrors((current) => ({ ...current, swimmer: undefined }));
      }}
      onChange={change}
      onSubmit={submit}
      onBack={onBack}
      exitFailed={exitFailed}
    />
  );
}
