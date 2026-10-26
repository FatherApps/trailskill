import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { athleteDisplay, type AthleteRepository } from '../../athletes';
import type { InvitationRepository } from '../data/invitations';
import { queueInvitation, type PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import type { ManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { useInvitation } from './useInvitation';
import { AddAthletesScreen, type AddAthleteField, type AddedAthlete } from './AddAthletesScreen';

export type AddAthletesContainerProps = {
  userId: string;
  step?: number;
  total?: number;
  profiles: ManagedAthleteProfileRepository;
  athletes: AthleteRepository;
  drafts: RegistrationDraftRepository;
  // The school invitation of the draft is accepted for each athlete added; it waits in `pending` until the athlete reaches the server.
  invitations: InvitationRepository;
  pending: PendingInvitationRepository;
  renderStatus?: (athleteId: string) => ReactNode;
  onContinue: () => void;
  onBack: () => void;
};

const empty = { firstName: '', lastName: '' };

export function AddAthletesContainer({
  userId,
  step = 3,
  total = 4,
  profiles,
  athletes,
  drafts,
  invitations,
  pending,
  renderStatus,
  onContinue,
  onBack,
}: AddAthletesContainerProps) {
  const [values, setValues] = useState(empty);
  const [added, setAdded] = useState<AddedAthlete[]>([]);
  const { categories } = useInvitation(drafts, invitations);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<false | 'add' | 'continue'>(false);

  const refresh = useCallback(
    () =>
      athletes.listManaged(userId).then((found) =>
        setAdded(found.map((a, index) => ({ id: a.id, ...pick(athleteDisplay(a, index)) }))),
      ),
    [athletes, userId],
  );

  useEffect(() => {
    // A failed read shows an empty form and nobody added: the person can still add.
    drafts.load().then((saved) => saved?.athlete && setValues(saved.athlete)).catch(() => {});
    refresh().catch(() => {});
  }, [drafts, refresh]);

  // Draft writes run one after another, so a slow keystroke save can never land after a later add or clear.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Resolves whether the write landed; it never rejects.
  const enqueue = (write: () => Promise<void>): Promise<boolean> => {
    const run = queue.current.then(write).then(
      () => true,
      () => false,
    );
    queue.current = run.then(() => {});
    return run;
  };
  // Losing a draft must not block typing. A missing draft stays missing: this screen only continues one the registration started.
  const persist = (athlete: typeof empty | undefined, step?: 'authorizations') =>
    enqueue(async () => {
      const current = await drafts.load();
      if (current) await drafts.save({ ...current, athlete, ...(step && { step }) });
    });

  function change(field: AddAthleteField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    void persist(next);
  }

  async function add() {
    setBusy(true);
    setFailed(false);
    let athleteId: string;
    try {
      athleteId = await profiles.createManagedAthlete({ userId, relation: 'guardian', ...values });
    } catch {
      // Nothing was saved: the names stay in the form and the person can try again.
      setFailed('add');
      setBusy(false);
      return;
    }
    setValues(empty);
    setCategoryId('');
    void persist(undefined);
    // The athlete only exists on this device so far: queue the acceptance, which retries until the server knows them. It never blocks the registration.
    const token = (await drafts.load().catch(() => null))?.invitationToken;
    if (token) void queueInvitation(pending, invitations, { userId, token, athleteId, ...(categoryId && { categoryId }) }).catch(() => {});
    // Saved already: a failed list read must not look like a failed save.
    await refresh().catch(() => {});
    setBusy(false);
  }

  // The profiles are saved, so the typed names have nothing left to keep; the swimmer choice and the reached step stay until the authorizations step ends.
  // If the step cannot be kept the person stays here: going on would bring them back to this screen on the next launch.
  async function finish() {
    setFailed(false);
    if (!(await persist(undefined, 'authorizations'))) return setFailed('continue');
    onContinue();
  }

  return (
    <AddAthletesScreen
      step={step}
      total={total}
      values={values}
      athletes={added}
      busy={busy}
      failed={failed}
      categories={categories}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      renderStatus={renderStatus}
      onChange={change}
      onAdd={() => void add()}
      onContinue={() => void finish()}
      onBack={onBack}
    />
  );
}

function pick({ shortName, initials, color }: ReturnType<typeof athleteDisplay>) {
  return { name: shortName, initials, color };
}
