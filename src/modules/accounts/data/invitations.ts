import { supabase } from '../../../core/sync';

export type InvitationInput = { schoolId: string; groupId: string };
// The token and the expiry (ISO 8601) the server generated.
export type CreatedInvitation = { token: string; expiresAt: string };

export interface InvitationRepository {
  /** Creates a new school invitation for the group. Online: only the server generates the token, so it cannot wait for a sync. */
  create(input: InvitationInput): Promise<CreatedInvitation>;
}

export function createSupabaseInvitationRepository(): InvitationRepository {
  return {
    async create({ schoolId, groupId }) {
      // The author, the token and the expiry are set by the server (default and trigger), never by the device.
      const { data, error } = await supabase.from('school_invitations').insert({ school_id: schoolId, group_id: groupId }).select('token, expires_at').single();
      if (error) throw error;
      return { token: data.token, expiresAt: data.expires_at };
    },
  };
}

export function createInMemoryInvitationRepository(options: { failing?: boolean } = {}) {
  const created: InvitationInput[] = [];
  const repository = {
    created,
    failing: options.failing ?? false,
    async create(input: InvitationInput): Promise<CreatedInvitation> {
      if (repository.failing) throw new Error('invitation failed');
      created.push({ ...input });
      return {
        token: String(created.length).padStart(32, '0'),
        expiresAt: '2026-11-08T00:00:00.000Z',
      };
    },
  };
  return repository;
}
