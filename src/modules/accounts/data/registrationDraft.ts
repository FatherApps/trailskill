import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';

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

// A registration typed on this phone and left unfinished (no account yet): offered back for 24 hours, then dropped,
// so whoever opens the sign-in next never sees someone else's data. A draft with no stamp predates the expiry and is dropped too.
// Drafts of an account that already exists (resume step, blank names) are left alone: they route the next sign-in.
export async function loadResumableDraft(drafts: RegistrationDraftRepository, now = Date.now()): Promise<RegistrationDraft | null> {
  const draft = await drafts.load();
  const typedNames = [draft?.firstName, draft?.lastName].some((name) => name?.trim());
  if (!draft?.swimmer || draft.step || !typedNames || !draft.email?.trim()) return null;
  if (draft.savedAt === undefined || now - draft.savedAt > DRAFT_TTL_MS) {
    await drafts.clear();
    return null;
  }
  return draft;
}

export type RegistrationStep = 'add_athletes' | 'authorizations';

export type FinishRegistrationInput = {
  userId: string;
  email: string;
  drafts: RegistrationDraftRepository;
  profiles: AdultProfileRepository;
  managedProfiles: ManagedAthleteProfileRepository;
};

// Runs once the account exists: stores the profile typed during registration, then drops the draft's personal fields.
// An adult also gets their own athlete profile (relation 'self', idempotent). In both cases the draft keeps only the swimmer choice
// and the result names the next step ('add_athletes' for a guardian, 'authorizations' for an adult); the authorizations step clears the draft.
// The kept draft of an adult and of a guardian stays bound to the account by its email; the add-athletes step records the guardian's reached step.
// A draft typed for another email is left alone, and a failed save keeps the draft so the next launch retries.
// An account that already had a profile under another name was signing in through registration: its profile stays as it is,
// the draft is dropped and nothing is routed.
export async function finishRegistration({
  userId,
  email,
  drafts,
  profiles,
  managedProfiles,
}: FinishRegistrationInput): Promise<RegistrationStep | undefined> {
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

export function useFinishRegistration(
  userId: string | undefined,
  email: string | undefined,
  drafts: RegistrationDraftRepository,
  profiles: AdultProfileRepository,
  managedProfiles: ManagedAthleteProfileRepository,
  onNext: (step: RegistrationStep) => void,
): void {
  useEffect(() => {
    if (!userId || !email) return;
    finishRegistration({ userId, email, drafts, profiles, managedProfiles })
      .then((next) => next && onNext(next))
      .catch(() => {});
  }, [userId, email, drafts, profiles, managedProfiles, onNext]);
}
