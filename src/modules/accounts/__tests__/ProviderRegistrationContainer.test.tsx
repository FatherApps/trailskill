import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryInvitationRepository } from '../data/invitations';
import { createInMemoryRegistrationDraftRepository, type RegistrationDraft } from '../data/registrationDraft';
import { ProviderRegistrationContainer, type ProviderAccount } from '../screens/ProviderRegistrationContainer';

// The invitation repository file reaches the sync layer, which is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-secure-store', () => ({}));

const TOKEN = 'a'.repeat(32);
const account: ProviderAccount = { email: 'paula@example.test', provider: 'google', firstName: 'Paula', lastName: 'Gomez' };
const stored = (email: string): RegistrationDraft => ({ firstName: '', lastName: '', email, codeRequested: true, invitationToken: TOKEN });

// The token is a real invitation: an unknown one would be dropped from the draft by the invitation check itself.
const invitations = createInMemoryInvitationRepository({ invitations: { [TOKEN]: { school: 'Escuela Sintética', group: 'Grupo A', categories: [] } } });

async function submitWith(draft: RegistrationDraft | null, who: ProviderAccount = account) {
  const drafts = createInMemoryRegistrationDraftRepository(draft);
  const onSaved = jest.fn();
  await render(
    <ProviderRegistrationContainer account={who} drafts={drafts} invitations={invitations} onSaved={onSaved} />,
  );
  await fireEvent.press(screen.getByRole('radio', { name: /Acudiente/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  return drafts.load();
}

async function showPanelWith(draft: RegistrationDraft, repository = invitations) {
  const drafts = createInMemoryRegistrationDraftRepository(draft);
  await render(<ProviderRegistrationContainer account={account} drafts={drafts} invitations={repository} onSaved={jest.fn()} />);
  return drafts;
}

describe('ProviderRegistrationContainer: the school of the invitation', () => {
  it('shows the school of a draft typed for the same email', async () => {
    await showPanelWith(stored('paula@example.test'));

    // The school is in the subtitle and in the banner.
    expect(await screen.findAllByText(/Escuela Sintética/)).toHaveLength(2);
  });

  it('shows nothing of the invitation left by another email on a shared phone, and leaves that draft as it is', async () => {
    const repository = createInMemoryInvitationRepository({ invitations: { [TOKEN]: { school: 'Escuela Sintética', group: 'Grupo A', categories: [] } } });
    const drafts = await showPanelWith(stored('someone@example.test'), repository);

    expect(screen.queryAllByText(/Escuela Sintética/)).toHaveLength(0);
    expect(repository.resolveCalls).toBe(0);
    expect((await drafts.load())?.invitationToken).toBe(TOKEN);
  });

  it('does not report as invalid, nor clear, the unknown token of another email', async () => {
    const drafts = await showPanelWith(stored('someone@example.test'), createInMemoryInvitationRepository());

    expect(screen.queryByText(/invitación/i)).toBeNull();
    expect((await drafts.load())?.invitationToken).toBe(TOKEN);
  });
});

describe('ProviderRegistrationContainer: the invitation of the stored draft', () => {
  it('keeps the invitation token of a draft typed for the same email', async () => {
    const saved = await submitWith(stored('paula@example.test'));

    expect(saved?.invitationToken).toBe(TOKEN);
  });

  it('compares the email without case or spaces', async () => {
    const saved = await submitWith(stored(' PAULA@Example.test '));

    expect(saved?.invitationToken).toBe(TOKEN);
  });

  it('does not take the token of a draft left for another email', async () => {
    const saved = await submitWith(stored('someone@example.test'));

    expect(saved).toMatchObject({ email: account.email, codeRequested: true, swimmer: 'child' });
    expect(saved?.invitationToken).toBeUndefined();
  });

  it('a draft with no email never lends its token', async () => {
    const saved = await submitWith(stored(''), { ...account, email: '' });

    expect(saved?.invitationToken).toBeUndefined();
  });

  it('saves with no token when there is no draft', async () => {
    const saved = await submitWith(null);

    expect(saved?.invitationToken).toBeUndefined();
  });
});
