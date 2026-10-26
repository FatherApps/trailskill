import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';

import type { InvitationRepository } from './invitations';

// An invitation waiting to be accepted for one athlete. It keeps its own token: the registration draft is cleared by the authorizations step.
export type PendingInvitation = { userId: string; token: string; athleteId: string; categoryId?: string };

export interface PendingInvitationRepository {
  list(): Promise<PendingInvitation[]>;
  /** One entry per athlete: adding again replaces nothing. */
  add(item: PendingInvitation): Promise<void>;
  remove(athleteId: string): Promise<void>;
}

const KEY = 'trailskill-pending-invitations';

export function createInMemoryPendingInvitationRepository(): PendingInvitationRepository {
  let items: PendingInvitation[] = [];
  return {
    async list() {
      return items;
    },
    async add(item) {
      if (!items.some((own) => own.athleteId === item.athleteId)) items = [...items, item];
    },
    async remove(athleteId) {
      items = items.filter((item) => item.athleteId !== athleteId);
    },
  };
}

// add() and remove() read the whole list and write it back, and they are called from different places (a screen, a sync retry): one at a time.
let writes: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = writes.then(operation);
  writes = run.catch(() => {});
  return run;
}

// Local, encrypted and never synced, like the registration draft.
export function createSecureStorePendingInvitationRepository(): PendingInvitationRepository {
  async function read(): Promise<PendingInvitation[]> {
    const raw = await SecureStore.getItemAsync(KEY);
    try {
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const write = (items: PendingInvitation[]) => (items.length === 0 ? SecureStore.deleteItemAsync(KEY) : SecureStore.setItemAsync(KEY, JSON.stringify(items)));
  return {
    list: read,
    add: (item) =>
      serialized(async () => {
        const items = await read();
        if (!items.some((own) => own.athleteId === item.athleteId)) await write([...items, item]);
      }),
    remove: (athleteId) => serialized(async () => write((await read()).filter((item) => item.athleteId !== athleteId))),
  };
}

// The server says the token or the category can never work (unknown, expired or revoked; category of another school): trying again changes nothing.
const PERMANENT = new Set(['P0002', '22023']);
// The chosen category was deactivated after the invitation was resolved (trigger check_violation): the athlete still joins the school and group, the school sets the category.
const INACTIVE_CATEGORY = '23514';

/**
 * Accepts the account's queued invitations. An athlete the server does not know yet is rejected as not managed by the caller (42501), and a missing
 * network throws: both stay queued for the next run. Accepting is idempotent on the server, so overlapping runs are harmless.
 * Shortcut: an entry for an athlete that never reaches the server stays queued, until the account's data is cleared.
 */
export async function acceptPendingInvitations(userId: string, pending: PendingInvitationRepository, invitations: InvitationRepository): Promise<void> {
  for (const { token, athleteId, categoryId } of (await pending.list()).filter((item) => item.userId === userId)) {
    try {
      await invitations.accept({ token, athleteId, ...(categoryId && { categoryId }) }).catch((error) => {
        if (!categoryId || (error as { code?: string }).code !== INACTIVE_CATEGORY) throw error;
        return invitations.accept({ token, athleteId });
      });
    } catch (error) {
      if (!PERMANENT.has((error as { code?: string }).code ?? '')) continue;
    }
    await pending.remove(athleteId);
  }
}

// Queues the invitation first, so a failed or slow first attempt loses nothing, then tries once right away.
export async function queueInvitation(pending: PendingInvitationRepository, invitations: InvitationRepository, item: PendingInvitation): Promise<void> {
  await pending.add(item);
  await acceptPendingInvitations(item.userId, pending, invitations);
}

// Retries the account's queued invitations when it signs in and whenever `refreshKey` changes (the caller passes something that changes
// when the athletes may have reached the server, for example the last sync time). A failed run waits for the next change.
export function usePendingInvitations(userId: string | undefined, pending: PendingInvitationRepository, invitations: InvitationRepository, refreshKey?: unknown) {
  useEffect(() => {
    if (userId) acceptPendingInvitations(userId, pending, invitations).catch(() => {});
  }, [userId, pending, invitations, refreshKey]);
}
