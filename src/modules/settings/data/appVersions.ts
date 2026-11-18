import * as SecureStore from 'expo-secure-store';

import { supabase } from '../../../core/sync';

export type AppVersions = { minVersion: string; latestVersion: string };
export type AppPlatform = 'android' | 'ios';
// blocked: this version may no longer run. update: a newer one exists. ok: nothing to show.
export type VersionGateStatus = 'blocked' | 'update' | 'ok';

const DOTTED_NUMBERS = /^[0-9]+(\.[0-9]+)*$/;

// Numeric, part by part (0.10.0 is newer than 0.9.0); a missing part is 0 (1.0 equals 1.0.0).
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

// `online` is true only for an answer the server gave in this session. A saved value never blocks (fail open, issue #1189): below the
// minimum it only warns, and the gate acts as soon as the server answers.
export function versionGate(native: string | null, versions: AppVersions | null, online: boolean): VersionGateStatus {
  if (!native || !versions) return 'ok';
  if (compareVersions(native, versions.minVersion) < 0) return online ? 'blocked' : 'update';
  return compareVersions(native, versions.latestVersion) < 0 ? 'update' : 'ok';
}

export type AppVersionsRepository = {
  /** The versions of the platform, or null when the server has no row for it. Throws when the server could not be asked. */
  fetch(platform: AppPlatform): Promise<AppVersions | null>;
};

export type AppVersionsCache = {
  load(): Promise<AppVersions | null>;
  save(versions: AppVersions): Promise<void>;
};

// Anyone reads the table, signed in or not: the gate runs before the sign-in.
export function createSupabaseAppVersionsRepository(): AppVersionsRepository {
  return {
    async fetch(platform) {
      const { data, error } = await supabase.from('app_versions').select('min_version, latest_version').eq('platform', platform).maybeSingle();
      if (error) throw error;
      return data ? { minVersion: data.min_version, latestVersion: data.latest_version } : null;
    },
  };
}

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const CACHE_KEY = 'trailskill-app-versions';

function parseVersions(raw: string | null): AppVersions | null {
  try {
    const value: unknown = raw == null ? null : JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { minVersion, latestVersion } = value as Record<string, unknown>;
    const valid = (version: unknown): version is string => typeof version === 'string' && DOTTED_NUMBERS.test(version);
    return valid(minVersion) && valid(latestVersion) ? { minVersion, latestVersion } : null;
  } catch {
    return null;
  }
}

// The last answer of the server, for the launches with no signal. Anything unreadable counts as no saved value.
export function createSecureStoreAppVersionsCache(): AppVersionsCache {
  return {
    async load() {
      try {
        return parseVersions(await SecureStore.getItemAsync(CACHE_KEY));
      } catch {
        return null;
      }
    },
    async save(versions) {
      await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(versions));
    },
  };
}

export function createInMemoryAppVersionsRepository(options: { versions?: AppVersions | null; failing?: boolean } = {}) {
  const repository = {
    calls: 0,
    failing: options.failing ?? false,
    versions: options.versions ?? null,
    async fetch(_platform: AppPlatform) {
      repository.calls += 1;
      if (repository.failing) throw new Error('no signal');
      return repository.versions;
    },
  };
  return repository;
}

export function createInMemoryAppVersionsCache(initial: AppVersions | null = null): AppVersionsCache {
  let saved = initial;
  return {
    async load() {
      return saved;
    },
    async save(versions) {
      saved = versions;
    },
  };
}
