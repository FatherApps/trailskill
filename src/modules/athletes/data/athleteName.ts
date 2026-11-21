// Same limit as the server (app.clean_athlete_name, issue #1364): 1 to 100 characters after trimming.
export const MAX_ATHLETE_NAME_LENGTH = 100;

/** The stored form of a first or last name: trimmed; null when it is empty or too long (the server would refuse it for good). */
export function cleanAthleteName(name: string): string | null {
  const cleaned = name.trim();
  return cleaned !== '' && cleaned.length <= MAX_ATHLETE_NAME_LENGTH ? cleaned : null;
}

/** Both names cleaned, or a thrown error: a repository never writes a name the server would reject. */
export function cleanAthleteNames({ firstName, lastName }: { firstName: string; lastName: string }): { firstName: string; lastName: string } {
  const first = cleanAthleteName(firstName);
  const last = cleanAthleteName(lastName);
  if (first === null || last === null) throw new Error('Invalid athlete name: 1 to 100 characters after trimming');
  return { firstName: first, lastName: last };
}
