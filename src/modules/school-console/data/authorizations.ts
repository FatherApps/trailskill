import {
  createPowerSyncAuthorizationStatusRepository,
  createSupabaseInvitationRepository,
  type AuthorizationPurpose as AccountsPurpose,
  type AuthorizationStatusRepository,
  type CreatedInvitation,
  type InvitationRepository,
} from '../../accounts';
import { authorizationPurposes, type AthleteAuthorizations, type AuthorizationPurpose, type AuthorizationStatus } from '../components/AuthorizationList';
import { createPowerSyncConsoleAthletesRepository, type ConsoleAthletesRepository } from './consoleAthletes';

// One athlete of the school with the status of each purpose. No guardian: school admins cannot read guardians yet (issue 220).
export type ConsoleAuthorizationRow = Omit<AthleteAuthorizations, 'guardian' | 'canResend'> & {
  // The group a new invitation goes to: the first of the athlete's groups by name; null when the athlete has none.
  groupId: string | null;
};

export interface AuthorizationsRepository {
  /** Athletes of the school with their status per purpose. Local database only. */
  listAthletes(schoolId: string): Promise<ConsoleAuthorizationRow[]>;
  /** Creates a new invitation for the group, for the guardian to answer again. Touches no authorization evidence. Online. */
  resend(schoolId: string, groupId: string): Promise<CreatedInvitation>;
}

type Dependencies = {
  athletes: Pick<ConsoleAthletesRepository, 'listAthletes'>;
  statuses: AuthorizationStatusRepository;
  invitations: InvitationRepository;
};

const accountsPurpose: Record<AuthorizationPurpose, AccountsPurpose> = {
  record: 'record_times',
  import: 'import_official_results',
  share: 'share_results_with_school',
};

export function createAuthorizationsRepository({ athletes, statuses, invitations }: Dependencies): AuthorizationsRepository {
  return {
    async listAthletes(schoolId) {
      const listed = await athletes.listAthletes(schoolId);
      const rows = await statuses.listStatuses(listed.map((a) => a.id));
      const granted = new Map(rows.map((row) => [`${row.athleteId}:${row.purpose}`, row.isGranted]));
      // No row means never answered: pending, never valid by default. A row that is not granted was withdrawn.
      const statusOf = (athleteId: string, purpose: AuthorizationPurpose): AuthorizationStatus => {
        const value = granted.get(`${athleteId}:${accountsPurpose[purpose]}`);
        return value === undefined ? 'pending' : value ? 'valid' : 'withdrawn';
      };
      return listed.map((a) => ({
        id: a.id,
        athlete: a.name,
        initials: a.initials,
        color: a.color,
        groupId: a.groupIds[0] ?? null,
        purposes: Object.fromEntries(authorizationPurposes.map((p) => [p, statusOf(a.id, p)])) as Record<AuthorizationPurpose, AuthorizationStatus>,
      }));
    },
    resend(schoolId, groupId) {
      return invitations.create({ schoolId, groupId });
    },
  };
}

export function createPowerSyncAuthorizationsRepository(): AuthorizationsRepository {
  return createAuthorizationsRepository({
    athletes: createPowerSyncConsoleAthletesRepository(),
    statuses: createPowerSyncAuthorizationStatusRepository(),
    invitations: createSupabaseInvitationRepository(),
  });
}
