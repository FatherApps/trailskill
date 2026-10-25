import {
  createPowerSyncAuthorizationStatusRepository,
  createSupabaseInvitationRepository,
  type AuthorizationPurpose as AccountsPurpose,
  type AuthorizationStatusRepository,
  type CreatedInvitation,
  type InvitationRepository,
} from '../../accounts';
import { supabase } from '../../../core/sync';
import {
  authorizationPurposes,
  type AthleteAuthorizations,
  type AuthorizationPurpose,
  type AuthorizationStatus,
  type SharingRequest,
} from '../components/AuthorizationList';
import { localDate } from '../components/formatDate';
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
  /** Requests of other schools to see this school's results, oldest first. Online only: never read from or written to the local database. Rejects on any error. */
  listSharingRequests(schoolId: string): Promise<SharingRequest[]>;
  /** Approves a pending request. Online; the server checks that the caller administers the school. */
  approveSharing(id: string): Promise<void>;
  /** Withdraws a pending or approved request. Online; the server keeps the evidence. */
  withdrawSharing(id: string): Promise<void>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: Error | null }> };

type SharingRow = { id: string; target_school_name: string; requested_at: string; approved_at: string | null };

type Dependencies = {
  athletes: Pick<ConsoleAthletesRepository, 'listAthletes'>;
  statuses: AuthorizationStatusRepository;
  invitations: InvitationRepository;
  sharing: RpcClient;
};

const accountsPurpose: Record<AuthorizationPurpose, AccountsPurpose> = {
  record: 'record_times',
  import: 'import_official_results',
  share: 'share_results_with_school',
};

export function createAuthorizationsRepository({ athletes, statuses, invitations, sharing }: Dependencies): AuthorizationsRepository {
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
    async listSharingRequests(schoolId) {
      const { data, error } = await sharing.rpc('result_sharing_requests', { school: schoolId });
      if (error) throw error;
      return (data as SharingRow[]).map((row) => ({
        id: row.id,
        school: row.target_school_name,
        requestedOn: localDate(new Date(row.requested_at)),
        status: row.approved_at === null ? 'pending' : 'approved',
      }));
    },
    async approveSharing(id) {
      const { error } = await sharing.rpc('approve_result_sharing', { sharing: id });
      if (error) throw error;
    },
    async withdrawSharing(id) {
      const { error } = await sharing.rpc('withdraw_result_sharing', { sharing: id });
      if (error) throw error;
    },
  };
}

export function createPowerSyncAuthorizationsRepository(): AuthorizationsRepository {
  return createAuthorizationsRepository({
    athletes: createPowerSyncConsoleAthletesRepository(),
    statuses: createPowerSyncAuthorizationStatusRepository(),
    invitations: createSupabaseInvitationRepository(),
    sharing: supabase,
  });
}
