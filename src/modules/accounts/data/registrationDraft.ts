import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';

import type { SwimmerChoice } from '../screens/WhoSwimsScreen';
import type { AdultProfileRepository } from './adultProfiles';

export type RegistrationDraft = {
  swimmer?: SwimmerChoice;
  firstName: string;
  lastName: string;
  email: string;
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

export type FinishRegistrationInput = {
  userId: string;
  email: string;
  drafts: RegistrationDraftRepository;
  profiles: AdultProfileRepository;
};

// Runs once the account exists: stores the profile typed during registration, then drops the draft's personal fields.
// A draft typed for another email is left alone, and a failed save keeps the draft so the next launch retries.
export async function finishRegistration({ userId, email, drafts, profiles }: FinishRegistrationInput): Promise<void> {
  const draft = await drafts.load();
  if (!draft) return;
  const firstName = draft.firstName?.trim();
  const lastName = draft.lastName?.trim();
  if (!firstName || !lastName) return;
  if (draft.email?.trim().toLowerCase() !== email.trim().toLowerCase()) return;
  await profiles.save({ userId, firstName, lastName });
  // Issue #42's next step needs the swimmer choice and clears it when it finishes; no personal data stays.
  if (draft.swimmer) await drafts.save({ swimmer: draft.swimmer, firstName: '', lastName: '', email: '' });
  else await drafts.clear();
}

export function useFinishRegistration(
  userId: string | undefined,
  email: string | undefined,
  drafts: RegistrationDraftRepository,
  profiles: AdultProfileRepository,
): void {
  useEffect(() => {
    if (!userId || !email) return;
    finishRegistration({ userId, email, drafts, profiles }).catch(() => {});
  }, [userId, email, drafts, profiles]);
}
