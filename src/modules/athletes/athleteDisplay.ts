import { formatShortName } from './formatShortName';

export type AthleteColor = 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';

const colors: AthleteColor[] = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'];

// How a row shows an athlete: "Mateo C.", "MC" and a colour taken from the position in the list.
export function athleteDisplay(athlete: { firstName: string; lastName: string }, index: number) {
  const first = athlete.firstName.trim();
  const last = athlete.lastName.trim().split(/\s+/)[0] ?? '';
  const initial = (word: string) => word.charAt(0).toUpperCase();
  return {
    shortName: formatShortName(athlete.firstName, athlete.lastName),
    initials: `${initial(first)}${initial(last)}`,
    color: colors[index % colors.length]!,
  };
}
