import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useHardwareBack } from '../../../core/ui';
import { athleteDisplay, type AthleteRepository } from '../../athletes';
import type { InvitationRepository } from '../data/invitations';
import { queueInvitation, type PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraft, RegistrationDraftRepository } from '../data/registrationDraft';
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
// Nothing typed is no draft: the screen keeps a draft only while there is something to keep.
const keep = (names: typeof empty) => (names.firstName || names.lastName ? names : undefined);
// Same registration: the fields the registration was started with. The athlete and the step are what this screen writes, so they do not tell registrations apart.
// shortcut: registrations are told apart by these fields only, so (1) one started again with the same data is not told apart and (2) an edit of these fields in the same registration skips the late write-back;
// move to a stable key in the draft (id or createdAt) if the draft outlives a session or another flow rewrites it.
const sameRegistration = (a: RegistrationDraft, b: RegistrationDraft) =>
  a.swimmer === b.swimmer && a.firstName === b.firstName && a.lastName === b.lastName && a.email === b.email && a.invitationToken === b.invitationToken;
// The draft's athlete is exactly these names.
// shortcut: with no origin known, a registration discarded and started again with the same child is told apart only by these names, so a queued write could remove that draft's athlete (issue 611, decision B);
// it depends on the stable key named in the `sameRegistration` shortcut above, and the rule here stays as is until that key exists.
const holds = (draft: RegistrationDraft, names?: typeof empty) =>
  !!names && draft.athlete?.firstName === names.firstName && draft.athlete?.lastName === names.lastName;
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
  // How many times each field, and the category, was edited: one edited while something saved is the next athlete's even when it ends up with the same value (siblings share a last name; a category can go A, B, A).
  const edits = useRef({ firstName: 0, lastName: 0, category: 0 });
  const [added, setAdded] = useState<AddedAthlete[]>([]);
  const { categories } = useInvitation(drafts, invitations);
  const [categoryId, setCategoryId] = useState('');
  // The category as chosen right now, for add() to read whichever way it is called.
  // It and `categoryId` change together, only through `setCategory`: write it from nowhere else.
  const chosen = useRef('');
  const mounted = useRef(true);
  // Reads and saves that end after the screen went away must not touch its state: every such step goes through here.
  const ifMounted = useCallback(<T,>(run: () => T) => (mounted.current ? run() : undefined), []);
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
        if (read !== reads.current) return;
        ifMounted(() => {
          setUnreadable(false);
          setAdded(found.map((a) => ({ id: a.id, ...pick(athleteDisplay(a)) })));
        });
      },
      (error: unknown) => {
        if (read !== reads.current) return;
        ifMounted(() => setUnreadable(true));
        throw error;
      },
    );
  }, [athletes, userId, ifMounted]);

  // The route asked for it because "Continuar" is the only way out of this step. When that way is shut (the step cannot be kept, or adding failed and nobody is known to be added to continue with), back leaves through `onBack`.
  const noWayOut = failed === 'continue' || (failed === 'add' && !unreadable && added.length === 0);
  useHardwareBack(blockSystemBack ? (noWayOut ? onBack : swallowBack) : undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Draft writes run one after another, so a slow keystroke save can never land after a later add or clear.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Resolves whether the write landed; it never rejects.
  const enqueue = useCallback((write: () => Promise<void>): Promise<boolean> => {
    const run = queue.current.then(write).then(
      () => true,
      () => false,
    );
    queue.current = run.then(() => {});
    return run;
  }, []);
  // The first draft this screen saw: the registration it belongs to.
  const origin = useRef<RegistrationDraft | null>(null);
  // Losing a draft must not block typing. A missing draft stays missing: this screen only continues one the registration started.
  // Once the screen went away the draft may be another registration's (discarded and started again meanwhile): it is left alone.
  // A read that ends after that cannot be trusted to name the origin, so with none known the draft is left alone too: the last keystrokes of a screen left before any read ended are lost.
  // The one exception is `added`, the names an add just saved as a profile: a draft that holds exactly those names loses them even with no origin known, or the next launch would offer to add the athlete again.
  // Known limits (issue 611): the read, the comparison and the save are not one step, so another flow's clear+save in between is overwritten (the queue only orders this screen's writes);
  // and while the screen is there the draft is not compared, since nothing but this screen is expected to restart the registration.
  // shortcut: a save that changes nothing does not renew the 24 hours of the draft (issue 626), so only a write that changes it does; stamp it here if a draft must outlive a session of no typing.
  // shortcut: every keystroke reads the whole draft from the store before comparing, which costs a SecureStore read per key (issue 626); debounce the saves or compare against the last draft read if typing ever lags.
  const persist = useCallback(
    (athlete: typeof empty | undefined, { step, added }: { step?: 'authorizations'; added?: typeof empty } = {}) =>
      enqueue(async () => {
        const current = await drafts.load();
        if (!current) return;
        if (mounted.current) origin.current ??= current;
        else if (origin.current ? !sameRegistration(origin.current, current) : !holds(current, added)) return;
        // Nothing to change: the keystroke saves already left the draft as the form shows it.
        if (!step && current.athlete?.firstName === athlete?.firstName && current.athlete?.lastName === athlete?.lastName) return;
        await drafts.save({ ...current, athlete, ...(step && { step }) });
      }),
    [drafts, enqueue],
  );

  useEffect(() => {
    // A failed read shows an empty form and nobody added: the person can still add.
    drafts
      .load()
      .then((saved) => {
        if (saved && mounted.current) origin.current ??= saved;
        if (!saved?.athlete) return;
        const draft = saved.athlete;
        // A draft that took longer than the person did to start typing is older than what is on the screen, but only for the fields they edited.
        const next = {
          firstName: edits.current.firstName ? typed.current.firstName : draft.firstName,
          lastName: edits.current.lastName ? typed.current.lastName : draft.lastName,
        };
        // Safe after the screen went away: refs and the draft write.
        typed.current = next;
        // The keystroke saves wrote only what was typed: write back what was kept, or the draft would lose it.
        if (edits.current.firstName + edits.current.lastName > 0) void persist(keep(next));
        // Needs the screen.
        ifMounted(() => setValues(next));
      })
      .catch(() => {});
    refresh().catch(() => {});
  }, [drafts, refresh, ifMounted, persist]);

  function show(next: typeof empty) {
    typed.current = next;
    setValues(next);
  }

  function setCategory(next: string) {
    chosen.current = next;
    setCategoryId(next);
  }

  // A person's choice counts as an edit (see `edits`), so an add in flight leaves it for the next athlete.
  function chooseCategory(next: string) {
    edits.current.category++;
    setCategory(next);
  }

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
    // Read before any await, from the ref: a state read could be stale for a caller that is not a tap.
    const savingCategory = chosen.current;
    try {
      let athleteId: string;
      try {
        athleteId = await profiles.createManagedAthlete({ userId, relation: 'guardian', ...saving });
      } catch {
        // Nothing was saved: the names stay in the form and the person can try again.
        ifMounted(() => setFailed('add'));
        return;
      }
      // Only what was saved goes: what the person edited while it saved is the next athlete's (see `edits`).
      const left = {
        firstName: edits.current.firstName === savingEdits.firstName ? '' : typed.current.firstName,
        lastName: edits.current.lastName === savingEdits.lastName ? '' : typed.current.lastName,
      };
      ifMounted(() => {
        show(left);
        // Starting over after an add is not a choice, so it does not count as an edit.
        if (edits.current.category === savingEdits.category) setCategory('');
      });
      // Also after the screen went away: the saved names must leave the draft or the next launch would add them again.
      void persist(keep(left), { added: saving });
      // The athlete only exists on this device so far: queue the acceptance, which retries until the server knows them. It never blocks the registration.
      const token = (await drafts.load().catch(() => null))?.invitationToken;
      if (token) void queueInvitation(pending, invitations, { userId, token, athleteId, ...(savingCategory && { categoryId: savingCategory }) }).catch(() => {});
      // Saved already: a failed list read must not look like a failed save.
      await ifMounted(() => refresh().catch(() => {}));
    } finally {
      addingRef.current = false;
      ifMounted(() => setBusy(false));
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
      kept = await persist(keep(typed.current), { step: 'authorizations' });
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
