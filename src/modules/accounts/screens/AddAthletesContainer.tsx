import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { athleteDisplay, type AthleteRepository } from '../../athletes';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import type { ManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { AddAthletesScreen, type AddAthleteField, type AddedAthlete } from './AddAthletesScreen';

export type AddAthletesContainerProps = {
  userId: string;
  step?: number;
  total?: number;
  profiles: ManagedAthleteProfileRepository;
  athletes: AthleteRepository;
  drafts: RegistrationDraftRepository;
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
  renderStatus,
  onContinue,
  onBack,
}: AddAthletesContainerProps) {
  const [values, setValues] = useState(empty);
  const [added, setAdded] = useState<AddedAthlete[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
  const enqueue = (write: () => Promise<void>) => (queue.current = queue.current.then(write).catch(() => {}));
  // Never throws: losing a draft must not block typing.
  const persist = (athlete: typeof empty | undefined) =>
    enqueue(async () => {
      const current = await drafts.load();
      await drafts.save({ swimmer: 'child', firstName: '', lastName: '', email: '', ...current, athlete });
    });

  function change(field: AddAthleteField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    void persist(next);
  }

  async function add() {
    setBusy(true);
    setFailed(false);
    try {
      await profiles.createManagedAthlete({ userId, relation: 'guardian', ...values });
    } catch {
      // Nothing was saved: the names stay in the form and the person can try again.
      setFailed(true);
      setBusy(false);
      return;
    }
    setValues(empty);
    void persist(undefined);
    // Saved already: a failed list read must not look like a failed save.
    await refresh().catch(() => {});
    setBusy(false);
  }

  // The profiles are saved: the draft, swimmer choice included, has nothing left to keep.
  async function finish() {
    await enqueue(() => drafts.clear());
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
