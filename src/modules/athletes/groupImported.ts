import type { ImportedHistoryResult } from './achievements';

/** One result as the athlete sees it: the same swim from every source that has it, with the names of those sources. */
export type ImportedGroup = { result: ImportedHistoryResult; sourceName?: string };

// Maintainer's rule (issue 897): a federation may date a tournament by its first day while a results platform dates each session.
const MAX_DAYS_BETWEEN_SOURCES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

const sameSwim = (a: ImportedHistoryResult, b: ImportedHistoryResult) =>
  a.stroke === b.stroke && a.distance === b.distance && a.pool === b.pool && a.hundredths === b.hundredths;

// The same source dates exactly; two sources may be a few days apart.
const sameMoment = (a: ImportedHistoryResult, b: ImportedHistoryResult) =>
  a.provider === b.provider ? a.swumOn === b.swumOn : daysApart(a.swumOn, b.swumOn) <= MAX_DAYS_BETWEEN_SOURCES;

/**
 * Joins, at read time, the current revisions that are the same swim in different sources. Nothing is merged in storage: each source
 * keeps its own rows. A missing time never joins. The shown result is the one of a source that dates by session (`sessionDated`
 * lists those providers, from data), else the first; its date is the one shown. `sourceNames` maps a provider to its organization.
 */
export function groupImportedResults(
  results: readonly ImportedHistoryResult[],
  sourceNames: Readonly<Record<string, string>> = {},
  sessionDated: readonly string[] = [],
): ImportedGroup[] {
  const ordered = [...results].sort((a, b) => a.swumOn.localeCompare(b.swumOn) || a.id.localeCompare(b.id));
  const groups: ImportedHistoryResult[][] = [];
  for (const result of ordered) {
    const group = result.hundredths === null ? undefined : groups.find((members) => sameSwim(members[0], result) && members.every((m) => sameMoment(m, result)));
    if (group) group.push(result);
    else groups.push([result]);
  }
  return groups.map((members) => {
    const providers = [...new Set(members.map((m) => m.provider))].sort((a, b) => Number(sessionDated.includes(a)) - Number(sessionDated.includes(b)) || a.localeCompare(b));
    const names = providers.flatMap((provider) => (sourceNames[provider] ? [sourceNames[provider]] : []));
    return {
      result: members.find((m) => sessionDated.includes(m.provider)) ?? members[0],
      ...(names.length > 0 ? { sourceName: names.join(' · ') } : {}),
    };
  });
}
