import { useCallback, useEffect, useState, type ReactNode } from 'react';

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

  // Never throws: losing a draft must not block typing.
  const persist = (athlete: typeof empty | undefined) =>
    drafts
      .load()
      .then((current) => drafts.save({ swimmer: 'child', firstName: '', lastName: '', email: '', ...current, athlete }))
      .catch(() => {});

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
      setValues(empty);
      void persist(undefined);
      await refresh();
    } catch {
      // Nothing was saved: the names stay in the form and the person can try again.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // The profiles are saved: the draft, swimmer choice included, has nothing left to keep.
  async function finish() {
    await drafts.clear().catch(() => {});
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
