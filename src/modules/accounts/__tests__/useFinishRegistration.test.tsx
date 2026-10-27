import { act, render, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryAdultProfileRepository } from '../data/adultProfiles';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import {
  createInMemoryRegistrationDraftRepository,
  useFinishRegistration,
  type ExistingAccountNotice,
  type RegistrationDraft,
  type RegistrationOffer,
} from '../data/registrationDraft';

// The Supabase repository sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {}, writeBatch: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-secure-store', () => ({}));

const EMAIL = 'camila@example.test';
// codeRequested: the code was asked for from the registration screen, so verifying it completes the registration.
const base: RegistrationDraft = { firstName: 'Camila', lastName: 'Rojas', email: EMAIL, codeRequested: true };

function setup(draft: RegistrationDraft, profiles = createInMemoryAdultProfileRepository()) {
  const links: ManagedAthleteRow[] = [];
  const managed = createInMemoryManagedAthleteProfileRepository(createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(links)), links);
  const drafts = createInMemoryRegistrationDraftRepository(draft);
  const onNext = jest.fn();
  const save = jest.spyOn(profiles, 'save');
  type Session = { userId?: string; email?: string };
  const offer: { current: ReturnType<typeof useFinishRegistration> } = { current: undefined };
  function Probe({ userId, email }: Session) {
    offer.current = useFinishRegistration(userId, email, drafts, profiles, managed, onNext);
    return null;
  }
  const mount = (session: Session) => render(<Probe {...session} />);
  return { drafts, profiles, save, onNext, mount, Probe, offer };
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

describe('useFinishRegistration offer', () => {
  const typed: RegistrationDraft = { ...base, swimmer: 'adult', codeRequested: undefined };

  it('offers to resume a draft typed here whose code was never asked for, and stores nothing yet', async () => {
    const { offer, save, onNext, mount } = setup(typed);
    await mount({ userId: 'user-1', email: EMAIL });

    await waitFor(() => expect(offer.current?.email).toBe(EMAIL));
    expect(save).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('resumes: stores the profile, goes on and withdraws the offer', async () => {
    const { offer, save, onNext, mount } = setup(typed);
    await mount({ userId: 'user-1', email: EMAIL });
    await waitFor(() => expect(offer.current).toBeDefined());

    await act(async () => (offer.current as RegistrationOffer).resume());

    await waitFor(() => expect(onNext).toHaveBeenCalledWith('authorizations'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(offer.current).toBeUndefined();
  });

  it('starts again: deletes the draft and goes nowhere', async () => {
    const { offer, drafts, save, onNext, mount } = setup(typed);
    await mount({ userId: 'user-1', email: EMAIL });
    await waitFor(() => expect(offer.current).toBeDefined());

    await act(async () => (offer.current as RegistrationOffer).startOver());

    await waitFor(async () => expect(await drafts.load()).toBeNull());
    expect(offer.current).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('shows nothing of a draft typed for another email', async () => {
    const other = { ...typed, email: 'other@example.test' };
    const { offer, drafts, mount } = setup(other);
    await mount({ userId: 'user-1', email: EMAIL });

    await waitFor(async () => expect(await drafts.load()).toEqual(other));
    expect(offer.current).toBeUndefined();
  });
});

describe('useFinishRegistration existing account', () => {
  const existing = { userId: 'user-1', firstName: 'Ana', lastName: 'Gomez' };
  const setupExisting = () => setup({ ...base, swimmer: 'adult' }, createInMemoryAdultProfileRepository({ existing }));

  it('says the account already existed once the session is open, without routing or touching the profile', async () => {
    const { offer, profiles, drafts, onNext, mount } = setupExisting();
    await mount({ userId: 'user-1', email: EMAIL });

    await waitFor(() => expect(offer.current).toMatchObject({ existing: true, email: EMAIL }));
    expect(onNext).not.toHaveBeenCalled();
    expect(profiles.saved).toEqual([existing]);
    expect(await drafts.load()).toBeNull();
  });

  it('says nothing before the session is open, so the code is always checked first', async () => {
    const { offer, save, drafts, mount } = setupExisting();
    await mount({});

    expect(offer.current).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(await drafts.load()).not.toBeNull();
  });

  it('withdraws the notice when it is dismissed', async () => {
    const { offer, mount } = setupExisting();
    await mount({ userId: 'user-1', email: EMAIL });
    await waitFor(() => expect(offer.current).toBeDefined());

    await act(async () => (offer.current as ExistingAccountNotice).dismiss());

    expect(offer.current).toBeUndefined();
  });

  it('says nothing for a new account', async () => {
    const { offer, onNext, mount } = setup({ ...base, swimmer: 'adult' });
    await mount({ userId: 'user-1', email: EMAIL });

    await waitFor(() => expect(onNext).toHaveBeenCalledWith('authorizations'));
    expect(offer.current).toBeUndefined();
  });
});
