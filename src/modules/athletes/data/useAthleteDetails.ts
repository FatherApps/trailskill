import { useEffect, useState } from 'react';

import type { AthleteSchoolRepository } from './athleteSchools';
import type { SchoolAthlete } from './schoolAthletes';

// Satisfied by the school console's structure repository: the names of the categories and groups of a school.
export type AthleteStructure = {
  listCategories(schoolId: string): Promise<Named[]>;
  listGroups(schoolId: string): Promise<Named[]>;
};

type Named = { id: string; name: string };

// "Categoría · Grupo" for each athlete the device knows the names of, by athlete id. A failed lookup leaves that part out.
// shortcut: an athlete in several schools shows the first one by school id, with no picker. Upgrade when the product decides which school a guardian sees.
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

// The details of the athletes shown, empty until they are read. Changing the athletes reads them again.
export function useAthleteDetails(
  athletes: SchoolAthlete[] | undefined,
  links: AthleteSchoolRepository,
  structure: AthleteStructure,
): Record<string, string> {
  const [details, setDetails] = useState<{ athletes: SchoolAthlete[]; byId: Record<string, string> }>();
  const list = athletes ?? noAthletes;
  useEffect(() => {
    let active = true;
    readAthleteDetails(list, links, structure).then(
      (byId) => active && setDetails({ athletes: list, byId }),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [list, links, structure]);
  // Details read for other athletes are not shown for these.
  return details?.athletes === list ? details.byId : {};
}
