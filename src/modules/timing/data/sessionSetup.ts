import * as SecureStore from 'expo-secure-store';

import { distances, isDistance, isPool, isStroke, pools, strokes } from '../../../core/sport';
import type { SessionType } from './measurements';

export type Choice = { stroke: string; distance: string; pool: string; sessionType: SessionType };

export const initialChoice: Choice = {
  stroke: strokes[0].code,
  distance: distances[1].code,
  pool: pools[0].code,
  sessionType: 'training',
};

// What the coach prepared before timing: the event and who is timed, in timing order. Athlete ids only, no names.
export type SessionSetup = { choice: Choice; selectedIds: string[] };

export type SessionSetupRepository = {
  load(): Promise<SessionSetup | null>;
  save(setup: SessionSetup): Promise<void>;
};

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const SETUP_KEY = 'trailskill-timing-session-setup';

export function createInMemorySessionSetupRepository(initial: SessionSetup | null = null): SessionSetupRepository {
  let setup = initial;
  return {
    async load() {
      return setup;
    },
    async save(next) {
      setup = next;
    },
  };
}

// Local, encrypted and never synced, so it works without network and survives closing the app.
// SecureStore warns or fails above about 2048 bytes (roughly 50 ids). Past that only the event is kept, and restoreSetup then
// chooses everyone authorized. The text is ASCII (catalog codes and ids), so its length is its size in bytes.
// shortcut: a big roster loses its saved selection; upgrade to a local table if coaches need it kept.
const MAX_STORED_LENGTH = 2048;

export function createSecureStoreSessionSetupRepository(): SessionSetupRepository {
  return {
    async load() {
      const raw = await SecureStore.getItemAsync(SETUP_KEY);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' ? (parsed as SessionSetup) : null;
      } catch {
        return null;
      }
    },
    async save(setup) {
      let raw = JSON.stringify(setup);
      if (raw.length > MAX_STORED_LENGTH) raw = JSON.stringify({ choice: setup.choice, selectedIds: [] });
      await SecureStore.setItemAsync(SETUP_KEY, raw);
    },
  };
}

// Everyone authorized is timed, in roster order, until the coach chooses otherwise.
export const defaultSetup = (authorizedIds: string[]): SessionSetup => ({ choice: initialChoice, selectedIds: authorizedIds });

// A saved setup can be stale: the catalogs or the roster may have changed since. Keep what is still valid, default the rest.
export function restoreSetup(saved: Partial<SessionSetup> | null, authorizedIds: string[]): SessionSetup {
  const choice: Partial<Choice> = saved?.choice ?? {};
  const selectedIds = Array.isArray(saved?.selectedIds)
    ? [...new Set(saved.selectedIds)].filter((id) => authorizedIds.includes(id))
    : [];
  return {
    choice: {
      stroke: isStroke(choice.stroke) ? choice.stroke : initialChoice.stroke,
      distance: isDistance(choice.distance) ? choice.distance : initialChoice.distance,
      pool: isPool(choice.pool) ? choice.pool : initialChoice.pool,
      sessionType: choice.sessionType === 'competition' ? 'competition' : 'training',
    },
    selectedIds: selectedIds.length > 0 ? selectedIds : authorizedIds,
  };
}
