import { countUnsentRecords, supabase } from '../../../core/sync';

// Spaces, dots and hyphens are how people write a number, not part of it.
export const normalizeIdentityNumber = (text: string) => text.replace(/[\s.-]/g, '');
export const IDENTITY_NUMBER_MAX_LENGTH = 20;
// The same rule the server checks.
export const isValidIdentityNumber = (number: string) => /^[A-Za-z0-9]{1,20}$/.test(number);

// Numbers typed at registration wait here, in memory only, until the authorizations step decides whether they are sent.
export type IdentityNumberHold = {
  put(athleteId: string, identityNumber: string): void;
  // Returns the number and forgets it.
  take(athleteId: string): string | undefined;
  clear(): void;
};

export function createIdentityNumberHold(): IdentityNumberHold {
  const held = new Map<string, string>();
  return {
    put: (athleteId, identityNumber) => void held.set(athleteId, identityNumber),
    take(athleteId) {
      const number = held.get(athleteId);
      held.delete(athleteId);
      return number;
    },
    clear: () => held.clear(),
  };
}

// One hold for the whole app because adding athletes and authorizations are different routes.
// It dies with the app, so a registration cut in between loses the numbers.
export const identityNumbers = createIdentityNumberHold();

export interface IdentityDocumentRepository {
  /** Online, signed in. Throws on failure; the number is never part of the error. */
  save(input: { athleteId: string; identityNumber: string }): Promise<void>;
}

const WAIT_STEP_MS = 1000;
const WAIT_TRIES = 30;

export function createSupabaseIdentityDocumentRepository(): IdentityDocumentRepository {
  return {
    async save({ athleteId, identityNumber }) {
      // The server checks the athlete and the authorization, which may still be uploading from this phone.
      // shortcut: waits up to 30 s for the upload queue to empty; after that, or with no signal, the number is dropped and #81 asks again.
      for (let tries = 0; (await countUnsentRecords()).unsent > 0; tries++) {
        if (tries >= WAIT_TRIES) throw new Error('Saving the identity number failed (pending upload)');
        await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
      }
      const { error } = await supabase.rpc('save_athlete_identity_number', { athlete_id: athleteId, identity_number: identityNumber });
      if (error) throw new Error(`Saving the identity number failed (${error.code})`);
    },
  };
}

export function createInMemoryIdentityDocumentRepository() {
  const saved: { athleteId: string; identityNumber: string }[] = [];
  return {
    saved,
    failing: false as boolean,
    async save(input: { athleteId: string; identityNumber: string }) {
      if (this.failing) throw new Error('Saving the identity number failed');
      saved.push(input);
    },
  } satisfies IdentityDocumentRepository & { saved: unknown[]; failing: boolean };
}
