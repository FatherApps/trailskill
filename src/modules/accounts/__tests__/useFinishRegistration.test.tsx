import { render, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryAdultProfileRepository } from '../data/adultProfiles';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { createInMemoryRegistrationDraftRepository, useFinishRegistration, type RegistrationDraft } from '../data/registrationDraft';

// The Supabase repository sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {}, writeBatch: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-secure-store', () => ({}));

const EMAIL = 'camila@example.test';
const base: RegistrationDraft = { firstName: 'Camila', lastName: 'Rojas', email: EMAIL };

function setup(draft: RegistrationDraft, profiles = createInMemoryAdultProfileRepository()) {
  const links: ManagedAthleteRow[] = [];
  const managed = createInMemoryManagedAthleteProfileRepository(createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(links)), links);
  const drafts = createInMemoryRegistrationDraftRepository(draft);
  const onNext = jest.fn();
  const save = jest.spyOn(profiles, 'save');
  type Session = { userId?: string; email?: string };
  function Probe({ userId, email }: Session) {
    useFinishRegistration(userId, email, drafts, profiles, managed, onNext);
    return null;
  }
  const mount = (session: Session) => render(<Probe {...session} />);
  return { drafts, profiles, save, onNext, mount, Probe };
}

describe('useFinishRegistration routing', () => {
  it('opens the add screen for a guardian', async () => {
    const { onNext, mount } = setup({ ...base, swimmer: 'child' });
    await mount({ userId: 'user-1', email: EMAIL });

    await waitFor(() => expect(onNext).toHaveBeenCalledWith('add_athletes'));
  });

  it('opens the authorizations for an adult', async () => {
    const { onNext, mount } = setup({ ...base, swimmer: 'adult' });
    await mount({ userId: 'user-1', email: EMAIL });

    await waitFor(() => expect(onNext).toHaveBeenCalledWith('authorizations'));
  });
});

describe('useFinishRegistration timing', () => {
  it('waits for the session, then runs when it appears', async () => {
    const { save, onNext, mount, Probe } = setup({ ...base, swimmer: 'adult' });
    const view = await mount({});

    expect(save).not.toHaveBeenCalled();
    await view.rerender(<Probe userId="user-1" email={EMAIL} />);

    await waitFor(() => expect(onNext).toHaveBeenCalledWith('authorizations'));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not run again when the token refreshes with the same user', async () => {
    const { save, onNext, mount, Probe } = setup({ ...base, swimmer: 'adult' });
    const view = await mount({ userId: 'user-1', email: EMAIL });
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));

    await view.rerender(<Probe userId="user-1" email={EMAIL} />);
    await view.rerender(<Probe userId="user-1" email={EMAIL} />);

    expect(save).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft when saving fails and tries again at the next sign-in', async () => {
    const profiles = createInMemoryAdultProfileRepository({ failing: true });
    const { drafts, save, onNext, mount, Probe } = setup({ ...base, swimmer: 'adult' }, profiles);
    const view = await mount({ userId: 'user-1', email: EMAIL });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    expect(onNext).not.toHaveBeenCalled();
    expect((await drafts.load())?.firstName).toBe('Camila');

    profiles.failing = false;
    await view.rerender(<Probe />);
    await view.rerender(<Probe userId="user-1" email={EMAIL} />);

    await waitFor(() => expect(onNext).toHaveBeenCalledWith('authorizations'));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
