import { supabase } from '../../../core/sync';
import type { AuthorizationPurpose } from './authorizationStatus';

export type InvitationInput = { schoolId: string; groupId: string };
// The token and the expiry (ISO 8601) the server generated.
export type CreatedInvitation = { token: string; expiresAt: string };

// What a token stands for, for the registration screens: the school, the group and the categories to pick from.
export type ResolvedInvitation = { school: string; group: string; categories: { id: string; name: string }[] };
// The three purposes that joining a school accepts together (maintainer decision, 2026-11-21), in screen order. The server fixes the same three.
export const JOIN_PURPOSES: AuthorizationPurpose[] = ['record_times', 'import_official_results', 'share_results_with_school'];

// What the person accepted by joining the school: the device time and, for each purpose, the text shown. The ids are made on the
// device, so sending the same consent again (a retry) never writes a second set of authorizations.
export type InvitationConsent = { acceptedAt: string; authorizations: { id: string; purpose: AuthorizationPurpose; textId: string }[] };
export type AcceptInvitationInput = { token: string; athleteId: string; categoryId?: string; consent: InvitationConsent };

export interface InvitationRepository {
  /** Creates a new school invitation for the group. Online: only the server generates the token, so it cannot wait for a sync. */
  create(input: InvitationInput): Promise<CreatedInvitation>;
  /** Online, no session needed. Null when the token is unknown, expired or revoked; throws when the request fails. */
  resolve(token: string): Promise<ResolvedInvitation | null>;
  /** Online, signed in: links the athlete to the invitation's school and group and records the three authorizations of joining, in one step. Throws on failure. */
  accept(input: AcceptInvitationInput): Promise<void>;
}

export function createSupabaseInvitationRepository(): InvitationRepository {
  return {
    async create({ schoolId, groupId }) {
      // The author, the token and the expiry are set by the server (default and trigger), never by the device.
      const { data, error } = await supabase.from('school_invitations').insert({ school_id: schoolId, group_id: groupId }).select('token, expires_at').single();
      if (error) throw error;
      return { token: data.token, expiresAt: data.expires_at };
    },
    async resolve(token) {
      const { data, error } = await supabase.rpc('resolve_invitation', { token });
      if (error) throw error;
      if (!data) return null;
      return {
        school: data.school_name,
        group: data.group_name,
        categories: (data.categories ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
      };
    },
    async accept({ token, athleteId, categoryId, consent }) {
      const { error } = await supabase.rpc('accept_invitation', {
        token,
        athlete_id: athleteId,
        category_id: categoryId ?? null,
        accepted_at: consent.acceptedAt,
        authorizations: consent.authorizations.map(({ id, purpose, textId }) => ({ id, purpose, text_id: textId })),
      });
      if (error) throw error;
    },
  };
}

export function createInMemoryInvitationRepository(
  options: { failing?: boolean; offline?: boolean; invitations?: Record<string, ResolvedInvitation> } = {},
) {
  const created: InvitationInput[] = [];
  const accepted: AcceptInvitationInput[] = [];
  const repository = {
    created,
    accepted,
    failing: options.failing ?? false,
    offline: options.offline ?? false,
    // A server error code that rejects every accept, for example '42501' while the athlete has not synced yet.
    rejectWith: undefined as string | undefined,
    // Like rejectWith, but only for an accept that carries a category (for example '23514' for an inactive one).
    rejectCategoryWith: undefined as string | undefined,
    resolveCalls: 0,
    async create(input: InvitationInput): Promise<CreatedInvitation> {
      if (repository.failing) throw new Error('invitation failed');
      created.push({ ...input });
      return {
        token: String(created.length).padStart(32, '0'),
        expiresAt: '2026-11-08T00:00:00.000Z',
      };
    },
    async resolve(token: string): Promise<ResolvedInvitation | null> {
      repository.resolveCalls++;
      if (repository.offline) throw new Error('offline');
      return options.invitations?.[token] ?? null;
    },
    async accept(input: AcceptInvitationInput): Promise<void> {
      if (repository.offline) throw new Error('offline');
      const code = repository.rejectWith ?? (input.categoryId ? repository.rejectCategoryWith : undefined);
      if (code) throw Object.assign(new Error('rejected'), { code });
      accepted.push({ ...input });
    },
  };
  return repository;
}
