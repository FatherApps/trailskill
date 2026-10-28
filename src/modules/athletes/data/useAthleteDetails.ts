import { useEffect, useMemo, useRef, useState } from 'react';

import type { AthleteSchoolRepository } from './athleteSchools';
import type { SchoolAthlete } from './schoolAthletes';

// Satisfied by the school console's structure repository: the names of the categories and groups of a school.
export type AthleteStructure = {
  listCategories(schoolId: string): Promise<Named[]>;
  listGroups(schoolId: string): Promise<Named[]>;
};

type Named = { id: string; name: string };

// Satisfied by the school console's school name repository.
export type AthleteSchoolNames = { listByIds(ids: readonly string[]): Promise<Named[]> };

// The names the device knows for an athlete; a part it does not know, or whose lookup failed, is left out.
export type AthleteDetail = { school?: string; category?: string; group?: string };

// The school, category and groups (joined with " · ") for each athlete the device knows something about, by athlete id.
// shortcut: an athlete in several schools shows the first link by school id and ignores the rest, with no picker. Upgrade when the product decides which school a guardian sees.
export async function readAthleteDetails(
  athletes: SchoolAthlete[],
  links: AthleteSchoolRepository,
  schoolNames: AthleteSchoolNames,
  structure: AthleteStructure,
): Promise<Record<string, AthleteDetail>> {
  const bySchool = new Map<string, Promise<[Named[], Named[]]>>();
  const namesOf = (schoolId: string) => {
    if (!bySchool.has(schoolId)) {
      bySchool.set(schoolId, Promise.all([structure.listCategories(schoolId).catch((): Named[] => []), structure.listGroups(schoolId).catch((): Named[] => [])]));
    }
    return bySchool.get(schoolId)!;
  };
  const schoolOf = new Map<string, Promise<string | undefined>>();
  const schoolNameOf = (schoolId: string) => {
    if (!schoolOf.has(schoolId)) {
      schoolOf.set(
        schoolId,
        schoolNames.listByIds([schoolId]).then(
          (found) => found.find((s) => s.id === schoolId)?.name,
          () => undefined,
        ),
      );
    }
    return schoolOf.get(schoolId)!;
  };
  const details: Record<string, AthleteDetail> = {};
  await Promise.all(
    athletes.map(async (athlete) => {
      const link = (await links.listByAthlete(athlete.id).catch(() => []))[0];
      if (!link) return;
      const [[categories, groups], school] = await Promise.all([namesOf(link.schoolId), schoolNameOf(link.schoolId)]);
      const category = categories.find((c) => c.id === link.categoryId)?.name;
      const group = groups.filter((g) => athlete.groupIds.includes(g.id)).map((g) => g.name).join(' · ');
      const detail: AthleteDetail = { ...(school && { school }), ...(category && { category }), ...(group && { group }) };
      if (Object.keys(detail).length > 0) details[athlete.id] = detail;
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
  schoolNames: AthleteSchoolNames,
  structure: AthleteStructure,
): Record<string, AthleteDetail> {
  const [details, setDetails] = useState<Record<string, AthleteDetail>>({});
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
    readAthleteDetails(latest.current, links, schoolNames, structure).then(
      (read) => active && setDetails(read),
      (error) => {
        if (__DEV__) console.warn('[athletes] Athlete details lookup failed', error);
      },
    );
    return () => {
      active = false;
    };
  }, [key, links, schoolNames, structure]);
  return details;
}
