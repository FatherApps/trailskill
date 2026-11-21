import type { TournamentEntry, TournamentProvider } from '../../port.ts';
import { createTournamentLookup, PROVIDER_KEY, tournamentFromUrl } from './lookup.ts';
import { createTournamentList } from './tournaments.ts';
import seed from './tournaments-2024-2025.json' with { type: 'json' };

/** The platform adapter for the registry: `createProviderRegistry([...], [createCoColombiaacuatica()])`. Organizations of type `results_platform` pick it with the provider key. */
export function createCoColombiaacuatica(fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch): TournamentProvider {
  return {
    key: PROVIDER_KEY,
    accepts(url) {
      try {
        tournamentFromUrl(url);
        return true;
      } catch {
        return false;
      }
    },
    listTournaments: createTournamentList(fetchImpl),
    // The reviewed 2024-2025 catalog (`scripts/results-import/build-tournament-seed.ts`): the platform's index lists only the current year.
    seedTournaments: seed as TournamentEntry[],
    lookup: createTournamentLookup(fetchImpl),
  };
}
