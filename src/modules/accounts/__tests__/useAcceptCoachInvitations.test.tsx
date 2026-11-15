import { render, waitFor } from '@testing-library/react-native';

import { createInMemoryCoachInvitationAcceptance, useAcceptCoachInvitations } from '../data/coachInvitationAcceptance';

// The Supabase adapter sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

function Probe({ userId, acceptance }: { userId: string | undefined; acceptance: ReturnType<typeof createInMemoryCoachInvitationAcceptance> }) {
  useAcceptCoachInvitations(userId, acceptance);
  return null;
}

describe('useAcceptCoachInvitations', () => {
  it('accepts once for a signed-in user, even when the screen renders again', async () => {
    const acceptance = createInMemoryCoachInvitationAcceptance();
    const view = await render(<Probe userId="user-1" acceptance={acceptance} />);
    await view.rerender(<Probe userId="user-1" acceptance={acceptance} />);

    await waitFor(() => expect(acceptance.calls).toBe(1));
  });

  it('does nothing without a user', async () => {
    const acceptance = createInMemoryCoachInvitationAcceptance();
    await render(<Probe userId={undefined} acceptance={acceptance} />);

    expect(acceptance.calls).toBe(0);
  });

  it('accepts again for another user', async () => {
    const acceptance = createInMemoryCoachInvitationAcceptance();
    const view = await render(<Probe userId="user-1" acceptance={acceptance} />);
    await view.rerender(<Probe userId="user-2" acceptance={acceptance} />);

    await waitFor(() => expect(acceptance.calls).toBe(2));
  });

  it('a failure does not throw: it is tried again on the next sign-in', async () => {
    const acceptance = createInMemoryCoachInvitationAcceptance({ failing: true });

    await render(<Probe userId="user-1" acceptance={acceptance} />);

    await waitFor(() => expect(acceptance.calls).toBe(1));
  });
});
