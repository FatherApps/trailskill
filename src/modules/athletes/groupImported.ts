import type { ImportedHistoryResult } from './achievements';

/** One result as the athlete sees it: the same swim from every source that has it, with the names of those sources. */
export type ImportedGroup = {
  result: ImportedHistoryResult;
  sourceName?: string;
  // The federation confirmed a swim a results platform also has; `federationName` is that federation's name, from data.
  validated: boolean;
  federationName?: string;
};

// Maintainer's rule (issue 897): a federation may date a tournament by its first day while a results platform dates each session.
const MAX_DAYS_BETWEEN_SOURCES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

// Maintainer's rule (issue 1470): two sources may differ by up to 0.10 s when each is the only candidate of the other.
const MAX_HUNDREDTHS_BETWEEN_SOURCES = 10;

const sameEvent = (a: ImportedHistoryResult, b: ImportedHistoryResult) => a.stroke === b.stroke && a.distance === b.distance && a.pool === b.pool;

const sameSwim = (a: ImportedHistoryResult, b: ImportedHistoryResult) => sameEvent(a, b) && a.hundredths === b.hundredths;

// The same source dates exactly; two sources may be a few days apart.
const sameMoment = (a: ImportedHistoryResult, b: ImportedHistoryResult) =>
  a.provider === b.provider ? a.swumOn === b.swumOn : daysApart(a.swumOn, b.swumOn) <= MAX_DAYS_BETWEEN_SOURCES;

// Two groups of different sources whose times differ within the tolerance (the times inside a group are equal; a missing time never joins).
const nearGroups = (a: ImportedHistoryResult[], b: ImportedHistoryResult[]) =>
  a[0].hundredths !== null &&
  b[0].hundredths !== null &&
  sameEvent(a[0], b[0]) &&
  Math.abs(a[0].hundredths - b[0].hundredths) <= MAX_HUNDREDTHS_BETWEEN_SOURCES &&
  a.every((x) => b.every((y) => x.provider !== y.provider && daysApart(x.swumOn, y.swumOn) <= MAX_DAYS_BETWEEN_SOURCES));

/**
 * Joins, at read time, the current revisions that are the same swim in different sources. Nothing is merged in storage: each source
 * keeps its own rows. A missing time never joins. The shown result is, whole (date, tournament and time), the one of a federation
 * source (`federation` lists those providers, from data; maintainer's rule, issue 1354, which replaces the session-date rule of
 * issue 897 when a federation is among the sources), else the one of a source that dates by session (`sessionDated`), else the
 * first. A group with a federation source and a session-dated one is `validated` (issue 1470). Sources whose times differ by up
 * to 0.10 s join only when each is the only candidate of the other; with more candidates the exact time is required.
 * `sourceNames` maps a provider to its organization; every source stays listed.
 */
export function groupImportedResults(
  results: readonly ImportedHistoryResult[],
  sourceNames: Readonly<Record<string, string>> = {},
  sessionDated: readonly string[] = [],
  federation: readonly string[] = [],
): ImportedGroup[] {
  const ordered = [...results].sort((a, b) => a.swumOn.localeCompare(b.swumOn) || a.id.localeCompare(b.id));
  const groups: ImportedHistoryResult[][] = [];
  for (const result of ordered) {
    const group = result.hundredths === null ? undefined : groups.find((members) => sameSwim(members[0], result) && members.every((m) => sameMoment(m, result)));
    if (group) group.push(result);
    else groups.push([result]);
  }
  // The tolerance pass: join the pairs that are each other's only candidate.
  const candidates = groups.map((g) => groups.filter((other) => other !== g && nearGroups(g, other)));
  const merged = groups.filter((g, i) => {
    const [other] = candidates[i];
    if (candidates[i].length !== 1 || candidates[groups.indexOf(other)].length !== 1) return true;
    if (groups.indexOf(other) < i) return false;
    g.push(...other);
    return true;
  });
  return merged.map((members) => {
    const providers = [...new Set(members.map((m) => m.provider))].sort((a, b) => Number(sessionDated.includes(a)) - Number(sessionDated.includes(b)) || a.localeCompare(b));
    const names = providers.flatMap((provider) => (sourceNames[provider] ? [sourceNames[provider]] : []));
    const federationProvider = providers.find((p) => federation.includes(p));
    const validated = federationProvider !== undefined && providers.some((p) => sessionDated.includes(p));
    return {
      validated,
      ...(validated && sourceNames[federationProvider] ? { federationName: sourceNames[federationProvider] } : {}),
      result: members.find((m) => federation.includes(m.provider)) ?? members.find((m) => sessionDated.includes(m.provider)) ?? members[0],
      ...(names.length > 0 ? { sourceName: names.join(' · ') } : {}),
    };
  });
}
