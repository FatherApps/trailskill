import type { AuthorizationStatusRepository, ManagedAthleteRepository } from '../../accounts';
import { athleteDisplay } from '../athleteDisplay';
import type { AthleteSchoolRepository } from '../data/athleteSchools';
import type { SchoolAthleteRepository } from '../data/schoolAthletes';
import { useAthleteDetails, type AthleteSchoolNames, type AthleteStructure } from '../data/useAthleteDetails';
import { useAuthorizedAthletes } from '../data/useAuthorizedAthletes';
import { useManagedAthletes } from '../data/useManagedAthletes';
import { useSelfAthleteId } from '../data/useSelfAthleteId';
import { MyAthletesScreen, type MyAthletesView } from './MyAthletesScreen';

export type MyAthletesContainerProps = {
  userId: string | undefined;
  managed: ManagedAthleteRepository;
  athletes: SchoolAthleteRepository;
  schoolLinks: AthleteSchoolRepository;
  schoolNames: AthleteSchoolNames;
  structure: AthleteStructure;
  authorizations: AuthorizationStatusRepository;
  // Changing it looks the athletes up again (the route passes the last sync).
  refreshKey?: unknown;
  onOpen: (athleteId: string) => void;
  onAdd: () => void;
  scrollEnabled?: boolean;
};

// Connects the screen to the athletes the user manages, the names of their school, category and group, and their authorization on this device.
export function MyAthletesContainer({
  userId,
  managed,
  athletes,
  schoolLinks,
  schoolNames,
  structure,
  authorizations,
  refreshKey,
  onOpen,
  onAdd,
  scrollEnabled,
}: MyAthletesContainerProps) {
  const result = useManagedAthletes(managed, athletes, userId, refreshKey);
  const details = useAthleteDetails(result.status === 'ready' ? result.athletes : undefined, schoolLinks, schoolNames, structure);
  const authorized = useAuthorizedAthletes(authorizations, refreshKey);
  const selfId = useSelfAthleteId(managed, userId, refreshKey);

  let view: MyAthletesView;
  if (result.status === 'loading') view = { kind: 'loading' };
  else if (result.athletes.length === 0) view = { kind: 'empty' };
  else {
    const cards = result.athletes.map((athlete) => {
      const { shortName, color } = athleteDisplay(athlete);
      return {
        id: athlete.id,
        name: shortName,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        color,
        ...details[athlete.id],
        authorized: authorized?.has(athlete.id),
        isSelf: athlete.id === selfId,
      };
    });
    // The user's own card goes first, so it is the one in front when the screen opens.
    view = { kind: 'data', athletes: [...cards.filter((card) => card.isSelf), ...cards.filter((card) => !card.isSelf)] };
  }
  return <MyAthletesScreen view={view} onOpen={onOpen} onAdd={onAdd} scrollEnabled={scrollEnabled} />;
}
