import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createInMemoryInvitationRepository } from '../data/invitations';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { InviteLinkContainer } from '../screens/InviteLinkContainer';
import { useInvitation } from '../screens/useInvitation';

// The Supabase repository sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Synthetic school, group and token only.
const resolved = { school: 'Escuela Delfines', group: 'Infantil B', categories: [{ id: 'c1', name: '9-10' }] };
const draft = { firstName: '', lastName: '', email: '', invitationToken: 'tok-1' };

function Probe(props: Parameters<typeof useInvitation>[0] extends infer D ? { drafts: D; invitations: Parameters<typeof useInvitation>[1] } : never) {
  const { invitation, invalid } = useInvitation(props.drafts, props.invitations);
  return (
    <>
      <Text>{invitation ? `ok:${invitation.school}/${invitation.group}` : 'none'}</Text>
      {invalid && <Text>invalid</Text>}
    </>
  );
}

describe('useInvitation', () => {
  it('resolves the saved token to the school and group', async () => {
    const drafts = createInMemoryRegistrationDraftRepository(draft);
    await render(<Probe drafts={drafts} invitations={createInMemoryInvitationRepository({ invitations: { 'tok-1': resolved } })} />);
    expect(await screen.findByText('ok:Escuela Delfines/Infantil B')).toBeOnTheScreen();
  });

  it('clears the token and reports the link as invalid when the server does not know it', async () => {
    const drafts = createInMemoryRegistrationDraftRepository(draft);
    await render(<Probe drafts={drafts} invitations={createInMemoryInvitationRepository()} />);
    expect(await screen.findByText('invalid')).toBeOnTheScreen();
    expect((await drafts.load())?.invitationToken).toBeUndefined();
  });

  it('keeps the token and shows nothing when there is no signal', async () => {
    const drafts = createInMemoryRegistrationDraftRepository(draft);
    const invitations = createInMemoryInvitationRepository({ offline: true, invitations: { 'tok-1': resolved } });
    await render(<Probe drafts={drafts} invitations={invitations} />);
    await waitFor(() => expect(invitations.resolveCalls).toBe(1));
    expect(screen.getByText('none')).toBeOnTheScreen();
    expect(screen.queryByText('invalid')).toBeNull();
    expect((await drafts.load())?.invitationToken).toBe('tok-1');
  });

  it('does nothing without a token', async () => {
    const invitations = createInMemoryInvitationRepository();
    await render(<Probe drafts={createInMemoryRegistrationDraftRepository()} invitations={invitations} />);
    expect(screen.getByText('none')).toBeOnTheScreen();
    expect(invitations.resolveCalls).toBe(0);
  });
});

describe('InviteLinkContainer', () => {
  it('saves the token into a new draft and sends a signed-out visitor to register', async () => {
    const drafts = createInMemoryRegistrationDraftRepository();
    const onDone = jest.fn();
    await render(<InviteLinkContainer token="tok-9" signedIn={false} drafts={drafts} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('register'));
    expect(await drafts.load()).toEqual({ firstName: '', lastName: '', email: '', invitationToken: 'tok-9' });
  });

  it('merges the token into an existing draft and sends a signed-in user home', async () => {
    const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'adult', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.test' });
    const onDone = jest.fn();
    await render(<InviteLinkContainer token="tok-9" signedIn drafts={drafts} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('home'));
    expect(await drafts.load()).toMatchObject({ swimmer: 'adult', firstName: 'Ana', invitationToken: 'tok-9' });
  });

  it('still navigates when the local save fails', async () => {
    const drafts = { load: async () => null, save: async () => Promise.reject(new Error('disk')), clear: async () => {} };
    const onDone = jest.fn();
    await render(<InviteLinkContainer token="tok-9" signedIn={false} drafts={drafts} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('register'));
  });
});
