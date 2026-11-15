import { useEffect } from 'react';

import { supabase } from '../../../core/sync';

export interface CoachInvitationAcceptance {
  /** Online, signed in: turns the pending coach invitations of the account's verified email into memberships. Returns how many. Throws on failure. */
  accept(): Promise<number>;
}

// The server reads the email from the account and decides everything; the device sends nothing.
export function createSupabaseCoachInvitationAcceptance(): CoachInvitationAcceptance {
  return {
    async accept() {
      const { data, error } = await supabase.rpc('accept_coach_invitations');
      if (error) throw error;
      return data ?? 0;
    },
  };
}

export function createInMemoryCoachInvitationAcceptance(options: { failing?: boolean; onAccept?: () => void } = {}) {
  const acceptance = {
    calls: 0,
    // An arrow so it can be passed around without its object.
    accept: async () => {
      acceptance.calls += 1;
      if (options.failing) throw new Error('no signal');
      options.onAccept?.();
      return 0;
    },
  };
  return acceptance;
}

// Once per account on this device session: covers a person who already had a profile (the gate does not ask the server then), for example
// a guardian invited as coach later. A failure is not shown: the next sign-in tries again, and nothing is lost meanwhile.
export function useAcceptCoachInvitations(userId: string | undefined, acceptance: CoachInvitationAcceptance) {
  useEffect(() => {
    if (!userId) return;
    acceptance.accept().catch(() => {});
  }, [userId, acceptance]);
}
