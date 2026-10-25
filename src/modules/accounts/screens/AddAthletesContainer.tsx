import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { athleteDisplay, type AthleteRepository } from '../../athletes';
import type { ManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { AddAthletesScreen, type AddAthleteField, type AddedAthlete } from './AddAthletesScreen';

type AthleteDraft = { firstName: string; lastName: string };

// The part of the registration draft this step uses (RegistrationDraftRepository, task 2.3): the rest of the draft is kept as is.
export type AthleteDraftStore = {
  load(): Promise<{ athlete?: AthleteDraft } | null | undefined>;
  save(draft: { athlete?: AthleteDraft }): Promise<void>;
};

export type AddAthletesContainerProps = {
  userId: string;
  relation: 'guardian' | 'self';
  step?: number;
  total?: number;
  profiles: ManagedAthleteProfileRepository;
  athletes: AthleteRepository;
  draft: AthleteDraftStore;
  renderStatus?: (athleteId: string) => ReactNode;
  onContinue: () => void;
  onBack: () => void;
};

const empty: AthleteDraft = { firstName: '', lastName: '' };

export function AddAthletesContainer({
  userId,
  relation,
  step = 3,
  total = 4,
  profiles,
  athletes,
  draft,
  renderStatus,
  onContinue,
  onBack,
}: AddAthletesContainerProps) {
  const [values, setValues] = useState<AthleteDraft>(empty);
  const [added, setAdded] = useState<AddedAthlete[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      athletes.listManaged(userId).then((found) =>
        setAdded(found.map((a, index) => ({ id: a.id, ...pick(athleteDisplay(a, index)) }))),
      ),
    [athletes, userId],
  );

  useEffect(() => {
    // A failed read shows an empty form and nobody added: the person can still add.
    draft.load().then((saved) => saved?.athlete && setValues(saved.athlete)).catch(() => {});
    refresh().catch(() => {});
  }, [draft, refresh]);

  // Never throws: losing a draft must not block typing.
  const persist = (athlete: AthleteDraft | undefined) =>
    draft.load().then((current) => draft.save({ ...current, athlete })).catch(() => {});

  function change(field: AddAthleteField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    void persist(next);
  }

  async function add() {
    setBusy(true);
    try {
      await profiles.createManagedAthlete({ userId, relation, ...values });
      setValues(empty);
      void persist(undefined);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AddAthletesScreen
      step={step}
      total={total}
      values={values}
      athletes={added}
      relation={relation}
      busy={busy}
      renderStatus={renderStatus}
      onChange={change}
      onAdd={() => void add().catch(() => {})}
      onContinue={onContinue}
      onBack={onBack}
    />
  );
}

function pick({ shortName, initials, color }: ReturnType<typeof athleteDisplay>) {
  return { name: shortName, initials, color };
}
