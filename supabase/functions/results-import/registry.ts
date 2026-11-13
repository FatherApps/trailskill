import type { ResultsProvider, TournamentProvider } from './port.ts';

/** One row of `organizations` plus the provider key `results_import_sources` assigns to it. */
export type OrganizationData = {
  id: string;
  type: 'federation' | 'results_platform' | 'league' | 'club' | 'school';
  countryCode: string | null;
  parentId: string | null;
  provider: string | null;
};

const PROVIDER_KEY = /^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The provider key of an organization of this type, only when it starts with the organization's own country (the database rule).
const providerOf = (organization: OrganizationData, type: OrganizationData['type']) =>
  organization.type === type && organization.countryCode && organization.provider?.startsWith(`${organization.countryCode.toLowerCase()}-`) ? organization.provider : null;

/** `adapters` read athletes of a federation; `platforms` read one tournament at a time. Their keys are checked together. */
export function createProviderRegistry(adapters: readonly ResultsProvider[], platforms: readonly TournamentProvider[] = []) {
  const byKey = new Map<string, ResultsProvider>();
  const platformByKey = new Map<string, TournamentProvider>();
  const checked = (adapter: { key: string }) => {
    if (!PROVIDER_KEY.test(adapter.key)) throw new Error(`Invalid provider key: ${adapter.key}`);
    if (byKey.has(adapter.key) || platformByKey.has(adapter.key)) throw new Error(`Duplicate provider key: ${adapter.key}`);
    return adapter.key;
  };
  for (const adapter of adapters) byKey.set(checked(adapter), adapter);
  for (const platform of platforms) platformByKey.set(checked(platform), platform);

  return {
    /** Walks from `startId` up through the parents; the first federation with a registered provider of its own country wins. */
    resolve(organizations: readonly OrganizationData[], startId: string): ResultsProvider | null {
      const byId = new Map(organizations.map((organization) => [organization.id, organization]));
      const seen = new Set<string>();
      let current = byId.get(startId);
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        const adapter = byKey.get(providerOf(current, 'federation') ?? '');
        if (adapter) return adapter;
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return null;
    },

    /**
     * The platform and the organization of a pasted address: exactly one adapter accepts it and exactly one `results_platform`
     * organization holds that adapter's provider. Anything else (none, or more than one) is null, never a guess.
     */
    resolveUrl(organizations: readonly OrganizationData[], url: string): { provider: TournamentProvider; organizationId: string } | null {
      const accepting = [...platformByKey.values()].filter((platform) => platform.accepts(url));
      if (accepting.length !== 1) return null;
      const [provider] = accepting;
      const holders = organizations.filter((organization) => providerOf(organization, 'results_platform') === provider.key);
      return holders.length === 1 ? { provider, organizationId: holders[0].id } : null;
    },

    /** The platform adapter of a `results_platform` organization itself (a platform has no parents to walk), or null. */
    platformFor(organizations: readonly OrganizationData[], organizationId: string): TournamentProvider | null {
      const organization = organizations.find((candidate) => candidate.id === organizationId);
      return (organization && platformByKey.get(providerOf(organization, 'results_platform') ?? '')) || null;
    },
  };
}

export type ProviderRegistry = ReturnType<typeof createProviderRegistry>;
