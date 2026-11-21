import { render, waitFor } from '@testing-library/react-native';

import { createInMemoryInvitationRepository } from '../data/invitations';
import { createInMemoryPendingInvitationRepository, usePendingInvitations } from '../data/pendingInvitations';

jest.mock('expo-secure-store', () => ({}));
jest.mock('../../../core/sync', () => ({ supabase: {} }));

type ProbeProps = {
  userId?: string;
  refreshKey: number;
  pending: ReturnType<typeof createInMemoryPendingInvitationRepository>;
  invitations: ReturnType<typeof createInMemoryInvitationRepository>;
};

function Probe({ userId, refreshKey, pending, invitations }: ProbeProps) {
  usePendingInvitations(userId, pending, invitations, refreshKey);
  return null;
}

// What the authorizations step stores when the person accepts; an entry without it is never sent.
const consent = { acceptedAt: '2026-11-01T10:00:00.000Z', authorizations: [{ id: 'id-record', purpose: 'record_times' as const, textId: 't-record' }] };

describe('usePendingInvitations', () => {
  it('retries when the key changes, once the athlete reached the server', async () => {
    const pending = createInMemoryPendingInvitationRepository();
    const invitations = createInMemoryInvitationRepository();
    // Synthetic token and ids only.
    await pending.add({ userId: 'u1', token: 'a'.repeat(32), athleteId: 'a1', consent });
    invitations.rejectWith = '42501';

    const view = await render(<Probe userId="u1" refreshKey={1} pending={pending} invitations={invitations} />);
    await waitFor(() => expect(invitations.accepted).toEqual([]));
    expect(await pending.list()).toHaveLength(1);

    invitations.rejectWith = undefined;
    await view.rerender(<Probe userId="u1" refreshKey={2} pending={pending} invitations={invitations} />);

    await waitFor(() => expect(invitations.accepted).toHaveLength(1));
    expect(await pending.list()).toEqual([]);
  });

  it('does nothing without a session', async () => {
    const pending = createInMemoryPendingInvitationRepository();
    const invitations = createInMemoryInvitationRepository();
    await pending.add({ userId: 'u1', token: 'a'.repeat(32), athleteId: 'a1' });

    await render(<Probe refreshKey={1} pending={pending} invitations={invitations} />);

    expect(invitations.accepted).toEqual([]);
  });
});
