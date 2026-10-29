import type { ResultsProvider } from './port.ts';

/** One row of `organizations` plus the provider key `results_import_sources` assigns to it. */
export type OrganizationData = {
  id: string;
  type: 'federation' | 'league' | 'club' | 'school';
  countryCode: string | null;
  parentId: string | null;
  provider: string | null;
};

const PROVIDER_KEY = /^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createProviderRegistry(adapters: readonly ResultsProvider[]) {
  const byKey = new Map<string, ResultsProvider>();
  for (const adapter of adapters) {
    if (!PROVIDER_KEY.test(adapter.key)) throw new Error(`Invalid provider key: ${adapter.key}`);
    if (byKey.has(adapter.key)) throw new Error(`Duplicate provider key: ${adapter.key}`);
    byKey.set(adapter.key, adapter);
  }

  return {
    /** Walks from `startId` up through the parents; the first federation with a registered provider of its own country wins. */
    resolve(organizations: readonly OrganizationData[], startId: string): ResultsProvider | null {
      const byId = new Map(organizations.map((organization) => [organization.id, organization]));
      const seen = new Set<string>();
      let current = byId.get(startId);
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        if (current.type === 'federation' && current.countryCode && current.provider?.startsWith(`${current.countryCode.toLowerCase()}-`)) {
          const adapter = byKey.get(current.provider);
          if (adapter) return adapter;
        }
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return null;
    },
  };
}

export type ProviderRegistry = ReturnType<typeof createProviderRegistry>;
