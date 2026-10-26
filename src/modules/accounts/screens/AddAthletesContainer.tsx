import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useHardwareBack } from '../../../core/ui';
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
  // Opt-in: the route that makes "Continuar" the only way out asks to ignore the system back button.
  blockSystemBack?: boolean;
  // Where back goes once "Continuar" is not a way out (see `blockSystemBack`). The route reached this screen with `replace`, so it decides where there is no history.
  onBack?: () => void;
  onContinue: () => void;
};

const empty = { firstName: '', lastName: '' };
// Stable, so the back subscription is made once while the block holds.
const swallowBack = () => {};

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
  blockSystemBack = false,
  onBack,
  onContinue,
}: AddAthletesContainerProps) {
  const [values, setValues] = useState(empty);
  // What is in the form right now, also for code that resumes after an await with a stale `values`.
  const typed = useRef(empty);
  // How many times each field was edited: a field edited while something saved is the next athlete's even when it ends up with the same text (siblings share a last name).
  const edits = useRef({ firstName: 0, lastName: 0 });
  const [added, setAdded] = useState<AddedAthlete[]>([]);
  const { categories } = useInvitation(drafts, invitations);
  const [categoryId, setCategoryId] = useState('');
  const chosenCategory = useRef('');
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const addingRef = useRef(false);
  const [failed, setFailed] = useState<false | 'add' | 'continue'>(false);
  // A list that could not be read says nothing about who is added: a missing datum is not zero.
  const [unreadable, setUnreadable] = useState(false);

  // Only the newest read counts: a slow, older one answers with a list that may no longer be true.
  const reads = useRef(0);
  const refresh = useCallback(() => {
    const read = ++reads.current;
    return athletes.listManaged(userId).then(
      (found) => {
        if (!mounted.current || read !== reads.current) return;
        setUnreadable(false);
        setAdded(found.map((a) => ({ id: a.id, ...pick(athleteDisplay(a)) })));
      },
      (error: unknown) => {
        if (!mounted.current || read !== reads.current) return;
        setUnreadable(true);
        throw error;
      },
    );
  }, [athletes, userId]);

  // The route asked for it because "Continuar" is the only way out of this step. When that way is shut (the step cannot be kept, or adding failed and nobody is known to be added to continue with), back leaves through `onBack`.
  const noWayOut = failed === 'continue' || (failed === 'add' && !unreadable && added.length === 0);
  useHardwareBack(blockSystemBack ? (noWayOut ? onBack : swallowBack) : undefined);

  // Reads and saves that end after the screen went away must not touch its state.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // A failed read shows an empty form and nobody added: the person can still add.
    drafts
      .load()
      .then((saved) => {
        // A draft that took longer than the person did to start typing is older than what is on the screen.
        const typing = edits.current.firstName + edits.current.lastName > 0;
        if (!mounted.current || typing || !saved?.athlete) return;
        typed.current = saved.athlete;
        setValues(saved.athlete);
      })
      .catch(() => {});
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

  function show(next: typeof empty) {
    typed.current = next;
    setValues(next);
  }

  function chooseCategory(next: string) {
    chosenCategory.current = next;
    setCategoryId(next);
  }

  // Nothing typed is no draft: the screen keeps a draft only while there is something to keep.
  const keep = (names: typeof empty) => (names.firstName || names.lastName ? names : undefined);

  function change(field: AddAthleteField, value: string) {
    edits.current[field]++;
    const next = { ...typed.current, [field]: value };
    show(next);
    void persist(next);
  }

  async function add() {
    // An add in flight, or Continuar saving the step, blocks a second add.
    if (addingRef.current || finishingRef.current) return;
    addingRef.current = true;
    setBusy(true);
    setFailed(false);
    const saving = typed.current;
    const savingEdits = { ...edits.current };
    const savingCategory = chosenCategory.current;
    try {
      let athleteId: string;
      try {
        athleteId = await profiles.createManagedAthlete({ userId, relation: 'guardian', ...saving });
      } catch {
        // Nothing was saved: the names stay in the form and the person can try again.
        if (mounted.current) setFailed('add');
        return;
      }
      // Only what was saved goes: a field or a category the person touched while it saved is the next athlete's.
      const left = {
        firstName: edits.current.firstName === savingEdits.firstName ? '' : typed.current.firstName,
        lastName: edits.current.lastName === savingEdits.lastName ? '' : typed.current.lastName,
      };
      if (mounted.current) {
        show(left);
        if (chosenCategory.current === savingCategory) chooseCategory('');
      }
      // Also after the screen went away: the saved names must leave the draft or the next launch would add them again.
      void persist(keep(left));
      // The athlete only exists on this device so far: queue the acceptance, which retries until the server knows them. It never blocks the registration.
      const token = (await drafts.load().catch(() => null))?.invitationToken;
      if (token) void queueInvitation(pending, invitations, { userId, token, athleteId, ...(savingCategory && { categoryId: savingCategory }) }).catch(() => {});
      // Saved already: a failed list read must not look like a failed save.
      if (mounted.current) await refresh().catch(() => {});
    } finally {
      addingRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // The profiles are saved; the names typed for the next athlete, the swimmer choice and the reached step stay until the authorizations step ends.
  // If the step cannot be kept the person stays here: going on would bring them back to this screen on the next launch.
  async function finish() {
    // A second tap while the first one still saves would continue twice; an add in flight would land after the step was kept.
    if (finishingRef.current || addingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    setFailed(false);
    let kept: boolean;
    try {
      kept = await persist(keep(typed.current), 'authorizations');
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
    if (!kept) return setFailed('continue');
    onContinue();
  }

  return (
    <AddAthletesScreen
      step={step}
      total={total}
      values={values}
      athletes={added}
      canContinue={added.length > 0 || unreadable}
      busy={busy}
      continuing={finishing}
      failed={failed}
      categories={categories}
      categoryId={categoryId}
      onCategoryChange={chooseCategory}
      renderStatus={renderStatus}
      onChange={change}
      onAdd={() => void add()}
      onContinue={() => void finish()}
    />
  );
}

function pick({ shortName, initials, color }: ReturnType<typeof athleteDisplay>) {
  return { name: shortName, initials, color };
}
