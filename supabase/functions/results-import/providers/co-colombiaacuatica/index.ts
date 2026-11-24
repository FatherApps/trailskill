import type { TournamentProvider } from '../../port.ts';
import { createTournamentLookup, PROVIDER_KEY, tournamentFromUrl } from './lookup.ts';
import { createTournamentProbe } from './probe.ts';
import { createTournamentList } from './tournaments.ts';

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
    probeTournaments: createTournamentProbe(fetchImpl),
    lookup: createTournamentLookup(fetchImpl),
  };
}
