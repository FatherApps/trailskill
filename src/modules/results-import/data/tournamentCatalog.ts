/** One tournament of a results platform's catalog, as the `results_import_tournaments` stream syncs it (#1339). */
export type TournamentCatalogEntry = {
  id: string;
  organizationId: string;
  year: number;
  /** The day of the tournament as a real `YYYYMMDD`: the `tournamentKey` the server accepts. */
  dateKey: string;
  name: string;
  city: string;
  discipline: string;
  course: string | null;
  /** Only an https address, never anything else: a caller shows it as a link only when it is not null. */
  sourceUrl: string | null;
  refreshedAt: string;
};

export interface TournamentCatalogRepository {
  /** Reads what the device has synced; works offline. Never calls the server. */
  list(): Promise<TournamentCatalogEntry[]>;
}

export type TournamentFilter = { text?: string; year?: number | null };
export type TournamentGroup = { city: string; tournaments: TournamentCatalogEntry[] };

/** A `YYYYMMDD` that exists on the calendar (no 20260230), not only eight digits. */
export function isRealDateKey(key: string): boolean {
  if (!/^\d{8}$/.test(key)) return false;
  const [year, month, day] = [Number(key.slice(0, 4)), Number(key.slice(4, 6)), Number(key.slice(6, 8))];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The address when it is https; anything else (http, javascript:, garbage) is not offered as a link. */
export function httpsOnly(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    return new URL(address).protocol === 'https:' ? address : null;
  } catch {
    return null;
  }
}

/** A stored row as an entry, or null for one the app must never offer (its date key is not a real day, so it could not be asked for). */
export function toCatalogEntry(row: Omit<TournamentCatalogEntry, 'sourceUrl'> & { sourceUrl: string | null }): TournamentCatalogEntry | null {
  return isRealDateKey(row.dateKey) ? { ...row, sourceUrl: httpsOnly(row.sourceUrl) } : null;
}

// Lower case without accents, so "alamos" finds "Álamos".
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Filters by text (name or city) and by year, groups by city from A to Z and orders each group from the most recent tournament to
 * the oldest. Two spellings of a city that differ only in case or accents share a group.
 */
export function groupTournaments(entries: TournamentCatalogEntry[], { text, year }: TournamentFilter): TournamentGroup[] {
  const needle = fold(text ?? '');
  const groups = new Map<string, TournamentGroup>();
  for (const entry of entries) {
    if (year != null && entry.year !== year) continue;
    if (needle && !fold(entry.name).includes(needle) && !fold(entry.city).includes(needle)) continue;
    const key = fold(entry.city);
    const group = groups.get(key) ?? { city: entry.city, tournaments: [] };
    group.tournaments.push(entry);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      city: group.city,
      tournaments: group.tournaments.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.id.localeCompare(b.id)),
    }));
}

/** For tests and the gallery: the same rules as the PowerSync repository, over a list. */
export function createInMemoryTournamentCatalogRepository(entries: TournamentCatalogEntry[]): TournamentCatalogRepository {
  return {
    async list() {
      return entries.flatMap((entry) => toCatalogEntry(entry) ?? []);
    },
  };
}
