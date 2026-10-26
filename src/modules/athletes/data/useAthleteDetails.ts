import { useEffect, useMemo, useRef, useState } from 'react';

import type { AthleteSchoolRepository } from './athleteSchools';
import type { SchoolAthlete } from './schoolAthletes';

// Satisfied by the school console's structure repository: the names of the categories and groups of a school.
export type AthleteStructure = {
  listCategories(schoolId: string): Promise<Named[]>;
  listGroups(schoolId: string): Promise<Named[]>;
};

type Named = { id: string; name: string };

// "Categoría · Grupo" for each athlete the device knows the names of, by athlete id. A failed lookup leaves that part out.
// shortcut: an athlete in several schools shows the first link by school id and ignores the rest, with no picker. Upgrade when the product decides which school a guardian sees.
export async function readAthleteDetails(
  athletes: SchoolAthlete[],
  links: AthleteSchoolRepository,
  structure: AthleteStructure,
): Promise<Record<string, string>> {
  const bySchool = new Map<string, Promise<[Named[], Named[]]>>();
  const namesOf = (schoolId: string) => {
    if (!bySchool.has(schoolId)) {
      bySchool.set(schoolId, Promise.all([structure.listCategories(schoolId).catch((): Named[] => []), structure.listGroups(schoolId).catch((): Named[] => [])]));
    }
    return bySchool.get(schoolId)!;
  };
  const details: Record<string, string> = {};
  await Promise.all(
    athletes.map(async (athlete) => {
      const link = (await links.listByAthlete(athlete.id).catch(() => []))[0];
      if (!link) return;
      const [categories, groups] = await namesOf(link.schoolId);
      const names = [
        categories.find((c) => c.id === link.categoryId)?.name,
        ...groups.filter((g) => athlete.groupIds.includes(g.id)).map((g) => g.name),
      ].filter((name): name is string => Boolean(name));
      if (names.length > 0) details[athlete.id] = names.join(' · ');
    }),
  );
  return details;
}

const noAthletes: SchoolAthlete[] = [];

// The details of the athletes shown, empty until they are read. Reads again only when their ids, categories or groups change, and keeps the previous details meanwhile and when a read fails.
// Each successful read replaces the whole map, so athletes no longer shown drop out; a failed read keeps the last map, harmless because it is looked up by athlete id.
export function useAthleteDetails(
  athletes: SchoolAthlete[] | undefined,
  links: AthleteSchoolRepository,
  structure: AthleteStructure,
): Record<string, string> {
  const [details, setDetails] = useState<Record<string, string>>({});
  const list = athletes ?? noAthletes;
  // Every sync hands over a new array: the content, not its identity, decides when to read again. Built once per array, with the groups sorted so their order does not matter.
  const key = useMemo(
    () => list.map((athlete) => `${athlete.id}:${athlete.categoryId ?? ''}:${[...athlete.groupIds].sort().join(',')}`).join('|'),
    [list],
  );
  const latest = useRef(list);
  useEffect(() => {
    latest.current = list;
  }, [list]);
  useEffect(() => {
    let active = true;
    readAthleteDetails(latest.current, links, structure).then(
      (read) => active && setDetails(read),
      (error) => {
        if (__DEV__) console.warn('[athletes] Athlete details lookup failed', error);
      },
    );
    return () => {
      active = false;
    };
  }, [key, links, structure]);
  return details;
}
