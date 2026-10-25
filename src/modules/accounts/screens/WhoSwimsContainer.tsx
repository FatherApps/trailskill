import { useEffect, useState } from 'react';

import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { WhoSwimsScreen, type SwimmerChoice } from './WhoSwimsScreen';

export type WhoSwimsContainerProps = {
  drafts: RegistrationDraftRepository;
  onContinue: (choice: SwimmerChoice) => void;
  onBack: () => void;
};

// Step 1: remembers who swims in the draft, so reopening the app continues from here.
export function WhoSwimsContainer({ drafts, onContinue, onBack }: WhoSwimsContainerProps) {
  // undefined while the draft loads: the screen opens already showing the saved choice.
  const [initial, setInitial] = useState<SwimmerChoice | null>();

  useEffect(() => {
    let current = true;
    drafts
      .load()
      .catch(() => null)
      .then((draft) => current && setInitial(draft?.swimmer ?? null));
    return () => {
      current = false;
    };
  }, [drafts]);

  async function select(choice: SwimmerChoice) {
    // Read again: the details step may have saved names since this screen loaded.
    const draft = await drafts.load().catch(() => null);
    // A failed local save must not block the flow: the choice travels on to the next step.
    await drafts.save({ firstName: '', lastName: '', email: '', ...draft, swimmer: choice }).catch(() => {});
    onContinue(choice);
  }

  if (initial === undefined) return null;
  return <WhoSwimsScreen initialChoice={initial ?? undefined} onSelect={select} onBack={onBack} />;
}
