import type { ManagedAthleteRepository } from '../../accounts';
import { athleteDisplay } from '../athleteDisplay';
import type { AthleteSchoolRepository } from '../data/athleteSchools';
import type { SchoolAthleteRepository } from '../data/schoolAthletes';
import { useAthleteDetails, type AthleteStructure } from '../data/useAthleteDetails';
import { useManagedAthletes } from '../data/useManagedAthletes';
import { MyAthletesScreen, type MyAthletesView } from './MyAthletesScreen';

export type MyAthletesContainerProps = {
  userId: string | undefined;
  managed: ManagedAthleteRepository;
  athletes: SchoolAthleteRepository;
  schoolLinks: AthleteSchoolRepository;
  structure: AthleteStructure;
  // Changing it looks the athletes up again (the route passes the last sync).
  refreshKey?: unknown;
  onOpen: (athleteId: string) => void;
  scrollEnabled?: boolean;
};

// Connects the screen to the athletes the user manages and the names of their category and group on this device.
export function MyAthletesContainer({
  userId,
  managed,
  athletes,
  schoolLinks,
  structure,
  refreshKey,
  onOpen,
  scrollEnabled,
}: MyAthletesContainerProps) {
  const result = useManagedAthletes(managed, athletes, userId, refreshKey);
  const details = useAthleteDetails(result.status === 'ready' ? result.athletes : undefined, schoolLinks, structure);

  let view: MyAthletesView;
  if (result.status === 'loading') view = { kind: 'loading' };
  else if (result.athletes.length === 0) view = { kind: 'empty' };
  else {
    view = {
      kind: 'data',
      athletes: result.athletes.map((athlete) => {
        const { shortName, color } = athleteDisplay(athlete);
        return { id: athlete.id, name: shortName, color, detail: details[athlete.id] };
      }),
    };
  }
  return <MyAthletesScreen view={view} onOpen={onOpen} scrollEnabled={scrollEnabled} />;
}
