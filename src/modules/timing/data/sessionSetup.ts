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
// shortcut: SecureStore suits a few dozen ids; upgrade to a local table if a roster grows past that.
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
    save: (setup) => SecureStore.setItemAsync(SETUP_KEY, JSON.stringify(setup)),
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
