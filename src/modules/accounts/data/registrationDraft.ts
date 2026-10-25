import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

import type { SwimmerChoice } from '../screens/WhoSwimsScreen';
import type { AdultProfileRepository } from './adultProfiles';
import type { ManagedAthleteProfileRepository } from './managedAthleteProfiles';

export type RegistrationDraft = {
  swimmer?: SwimmerChoice;
  firstName: string;
  lastName: string;
  email: string;
  // Step 3 (guardian): the profile being typed.
  athlete?: { firstName: string; lastName: string };
  // The step reached once the account and profiles exist; the authorizations step clears the draft.
  step?: 'authorizations';
  // The sign-up code was asked for from the registration screen for this email: verifying it completes this registration.
  // Without it the draft was only typed, and a later sign-in with that email is asked before the draft is resumed.
  codeRequested?: boolean;
  // Stamped by the SecureStore repository on every save; never set by callers.
  savedAt?: number;
};

export type RegistrationDraftRepository = {
  load(): Promise<RegistrationDraft | null>;
  save(draft: RegistrationDraft): Promise<void>;
  clear(): Promise<void>;
};

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const DRAFT_KEY = 'trailskill-registration-draft';

export function createInMemoryRegistrationDraftRepository(initial: RegistrationDraft | null = null): RegistrationDraftRepository {
  let draft = initial;
  return {
    async load() {
      return draft;
    },
    async save(next) {
      draft = next;
    },
    async clear() {
      draft = null;
    },
  };
}

// Local, encrypted and never synced; PowerSync's clear on sign-in does not touch it.
export function createSecureStoreRegistrationDraftRepository(): RegistrationDraftRepository {
  return {
    async load() {
      const raw = await SecureStore.getItemAsync(DRAFT_KEY);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' ? (parsed as RegistrationDraft) : null;
      } catch {
        return null;
      }
    },
    save: (draft) => SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() })),
    clear: () => SecureStore.deleteItemAsync(DRAFT_KEY),
  };
}

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// Run when the app opens: a draft older than 24 hours is dropped, so a phone passed to someone else never keeps it for long.
// A draft with no stamp predates the expiry and is dropped too.
export async function discardStaleDraft(drafts: RegistrationDraftRepository, now = Date.now()): Promise<void> {
  const draft = await drafts.load();
  if (draft && (draft.savedAt === undefined || now - draft.savedAt > DRAFT_TTL_MS)) await drafts.clear();
}

export type RegistrationStep = 'add_athletes' | 'authorizations';

export type FinishRegistrationInput = {
  userId: string;
  email: string;
  drafts: RegistrationDraftRepository;
  profiles: AdultProfileRepository;
  managedProfiles: ManagedAthleteProfileRepository;
  // The person chose to resume a draft that was only typed.
  confirmed?: boolean;
};

// Runs once the account exists: stores the profile typed during registration, then drops the draft's personal fields.
// An adult also gets their own athlete profile (relation 'self', idempotent). In both cases the draft keeps only the swimmer choice
// and the result names the next step ('add_athletes' for a guardian, 'authorizations' for an adult); the authorizations step clears the draft.
// The kept draft of an adult and of a guardian stays bound to the account by its email; the add-athletes step records the guardian's reached step.
// A draft typed for another email is left alone, and a failed save keeps the draft so the next launch retries.
// A draft that was only typed (its code was never asked for here) is not stored until the person confirms: the result is 'offer'.
// An account that already had a profile under another name was signing in through registration: its profile stays as it is,
// the draft is dropped and nothing is routed.
export async function finishRegistration({
  userId,
  email,
  drafts,
  profiles,
  managedProfiles,
  confirmed = false,
}: FinishRegistrationInput): Promise<RegistrationStep | 'offer' | undefined> {
  const draft = await drafts.load();
  if (!draft) return;
  const firstName = draft.firstName?.trim();
  const lastName = draft.lastName?.trim();
  const sameEmail = draft.email?.trim().toLowerCase() === email.trim().toLowerCase();
  // A person who left the flow unfinished comes back to the step they were on: the names were already saved and blanked.
  if (!firstName || !lastName) {
    if (!sameEmail) return;
    if (draft.swimmer === 'child') return draft.step ?? 'add_athletes';
    return draft.swimmer === 'adult' && draft.step === 'authorizations' ? 'authorizations' : undefined;
  }
  if (!sameEmail) return;
  if (!draft.codeRequested && !confirmed) return 'offer';
  const stored = await profiles.save({ userId, firstName, lastName });
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (!sameName(stored.firstName, firstName) || !sameName(stored.lastName, lastName)) {
    await drafts.clear();
    return;
  }
  if (draft.swimmer === 'child') {
    await drafts.save({ swimmer: 'child', firstName: '', lastName: '', email: draft.email });
    return 'add_athletes';
  }
  if (draft.swimmer === 'adult') {
    await managedProfiles.createManagedAthlete({ userId, firstName, lastName, relation: 'self' });
    await drafts.save({ swimmer: 'adult', firstName: '', lastName: '', email: draft.email, step: 'authorizations' });
    return 'authorizations';
  }
  await drafts.clear();
}

export type RegistrationOffer = { email: string; resume: () => void; startOver: () => void };

// Returns the offer to resume a draft typed here, shown after the sign-in; undefined when there is nothing to ask.
export function useFinishRegistration(
  userId: string | undefined,
  email: string | undefined,
  drafts: RegistrationDraftRepository,
  profiles: AdultProfileRepository,
  managedProfiles: ManagedAthleteProfileRepository,
  onNext: (step: RegistrationStep) => void,
): RegistrationOffer | undefined {
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    if (!userId || !email) return;
    finishRegistration({ userId, email, drafts, profiles, managedProfiles })
      .then((next) => (next === 'offer' ? setOffered(true) : next && onNext(next)))
      .catch(() => {});
  }, [userId, email, drafts, profiles, managedProfiles, onNext]);

  if (!offered || !userId || !email) return undefined;
  return {
    email,
    resume: () => {
      setOffered(false);
      finishRegistration({ userId, email, drafts, profiles, managedProfiles, confirmed: true })
        .then((next) => next && next !== 'offer' && onNext(next))
        .catch(() => setOffered(true));
    },
    startOver: () => {
      setOffered(false);
      drafts.clear().catch(() => {});
    },
  };
}
