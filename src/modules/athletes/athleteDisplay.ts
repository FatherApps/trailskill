import { formatShortName } from './formatShortName';

export type AthleteColor = 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';

const colors: AthleteColor[] = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'];

// An athlete keeps one colour on every screen: it comes from the id (the school console uses the same rule, so phone and tablet agree).
const colorOf = (id: string) => colors[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]!;

// How a row shows an athlete: "Mateo C.", "MC" and the colour of their id.
export function athleteDisplay(athlete: { id: string; firstName: string; lastName: string }) {
  const first = athlete.firstName.trim();
  const last = athlete.lastName.trim().split(/\s+/)[0] ?? '';
  const initial = (word: string) => word.charAt(0).toUpperCase();
  return {
    shortName: formatShortName(athlete.firstName, athlete.lastName),
    initials: `${initial(first)}${initial(last)}`,
    color: colorOf(athlete.id),
  };
}
