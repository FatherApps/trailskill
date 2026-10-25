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
    save: (draft) => SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft)),
    clear: () => SecureStore.deleteItemAsync(DRAFT_KEY),
  };
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
// A draft typed for another email is left alone, and a failed save keeps the draft so the next launch retries.
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
  // A person who left the flow unfinished comes back to the step they were on: the names were already saved and blanked.
  if (!firstName || !lastName) return draft.swimmer === 'child' ? 'add_athletes' : draft.swimmer === 'adult' ? 'authorizations' : undefined;
  if (draft.email?.trim().toLowerCase() !== email.trim().toLowerCase()) return;
  await profiles.save({ userId, firstName, lastName });
  if (draft.swimmer === 'child') {
    await drafts.save({ swimmer: 'child', firstName: '', lastName: '', email: '' });
    return 'add_athletes';
  }
  if (draft.swimmer === 'adult') {
    await managedProfiles.createManagedAthlete({ userId, firstName, lastName, relation: 'self' });
    await drafts.save({ swimmer: 'adult', firstName: '', lastName: '', email: '' });
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
