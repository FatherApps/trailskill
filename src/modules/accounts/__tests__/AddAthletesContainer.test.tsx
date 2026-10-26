import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryInvitationRepository } from '../data/invitations';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { acceptPendingInvitations, createInMemoryPendingInvitationRepository } from '../data/pendingInvitations';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { AddAthletesContainer } from '../screens/AddAthletesContainer';

// The accounts index reaches the PowerSync repositories; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, writeBatch: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic school, group, categories and token only.
const invitation = { school: 'Escuela Delfines', group: 'Infantil B', categories: [{ id: 'cat-1', name: '9-10' }] };

function setup(invitationToken?: string) {
  const rows: ManagedAthleteRow[] = [];
  const athletes = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(rows));
  const profiles = createInMemoryManagedAthleteProfileRepository(athletes, rows);
  const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: '', invitationToken });
  const pending = createInMemoryPendingInvitationRepository();
  const invitations = createInMemoryInvitationRepository({ invitations: { 'tok-1': invitation } });
  const onContinue = jest.fn();
  const onBack = jest.fn();
  const mount = (props: { blockSystemBack?: boolean } = {}) =>
    render(
      <AddAthletesContainer
        userId="guardian-1"
        profiles={profiles}
        athletes={athletes}
        drafts={drafts}
        invitations={invitations}
        pending={pending}
        onContinue={onContinue}
        onBack={onBack}
        {...props}
      />,
    );
  return { mount, onContinue, onBack, drafts, profiles, athletes, rows, pending, invitations };
}

describe('AddAthletesContainer', () => {
  it('requires both names, then adds the profile to the list showing only the short name', async () => {
    const { mount } = setup();
    await mount();

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    expect(screen.getByText('Escribe el nombre.')).toBeOnTheScreen();
    expect(screen.getByText('Escribe el apellido.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

    expect(await screen.findByText('Lucía R.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Agregar otro deportista' })).toBeOnTheScreen();
    expect(screen.queryByText(/documento|nacimiento/i)).toBeNull();
  });

  async function addLucia() {
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    await screen.findByText('Lucía R.');
  }

  it('with an invitation, the category is optional: adding without choosing accepts it with no category', async () => {
    const { mount, rows, invitations, onContinue } = setup('tok-1');
    await mount();
    await screen.findByRole('radio', { name: '9-10' });

    await addLucia();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(invitations.accepted).toEqual([{ token: 'tok-1', athleteId: rows[0].athleteId }]));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('with an invitation, the chosen category goes with the accepted athlete and the choice starts over for the next one', async () => {
    const { mount, rows, invitations } = setup('tok-1');
    await mount();
    await fireEvent.press(await screen.findByRole('radio', { name: '9-10' }));

    await addLucia();

    await waitFor(() => expect(invitations.accepted).toEqual([{ token: 'tok-1', athleteId: rows[0].athleteId, categoryId: 'cat-1' }]));
    expect(screen.getByRole('radio', { name: 'Sin categoría' }).props.accessibilityState.checked).toBe(true);
  });

  it('without network the acceptance stays pending, outlives the draft and completes by itself later', async () => {
    const { mount, drafts, rows, pending, invitations } = setup('tok-1');
    await mount();
    await screen.findByRole('radio', { name: '9-10' });
    invitations.offline = true;

    await addLucia();
    await drafts.clear();

    expect(await pending.list()).toEqual([{ userId: 'guardian-1', token: 'tok-1', athleteId: rows[0].athleteId, queuedAt: expect.any(Number) }]);
    invitations.offline = false;
    await acceptPendingInvitations('guardian-1', pending, invitations);
    expect(invitations.accepted).toHaveLength(1);
    expect(await pending.list()).toEqual([]);
  });

  it('without an invitation there is no category choice and nothing is queued', async () => {
    const { mount, pending, invitations } = setup();
    await mount();

    await addLucia();

    expect(screen.queryByRole('radio', { name: 'Sin categoría' })).toBeNull();
    expect(await pending.list()).toEqual([]);
    expect(invitations.accepted).toEqual([]);
  });

  it('the typed names survive a restart of the screen', async () => {
    const { mount } = setup();
    const first = await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await first.unmount();

    await mount();

    expect(await screen.findByDisplayValue('Lucía')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Rojas')).toBeOnTheScreen();
  });

  it('Continuar keeps the swimmer choice and the reached step in the draft, drops the typed names and goes on', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await mount();
    await screen.findByText('Lucía R.');

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(await drafts.load()).toEqual({ swimmer: 'child', firstName: '', lastName: '', email: '', step: 'authorizations' });
  });

  it('Continuar stays on the screen with an error when the reached step cannot be saved', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await mount();
    await screen.findByText('Lucía R.');
    const failing = jest.spyOn(drafts, 'save').mockRejectedValue(new Error('store failed'));

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('No pudimos guardar el avance. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(onContinue).not.toHaveBeenCalled();

    failing.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(screen.queryByText('No pudimos guardar el avance. Inténtalo de nuevo.')).toBeNull();
  });

  it('with no draft, typing and continuing never invent one', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await drafts.clear();
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Mateo');
    await screen.findByText('Lucía R.');

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(await drafts.load()).toBeNull();
  });

  it('shows an error and keeps the names when the profile cannot be saved', async () => {
    const { mount, profiles } = setup();
    jest.spyOn(profiles, 'createManagedAthlete').mockRejectedValue(new Error('write failed'));
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

    expect(await screen.findByText('No pudimos guardar el deportista. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Lucía')).toBeOnTheScreen();
  });

  it('a slow keystroke save never resurrects the athlete in the draft after add', async () => {
    const { mount, drafts, profiles } = setup();
    const save = drafts.save;
    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    drafts.save = async (d) => {
      if (first) {
        first = false;
        await slow;
      }
      return save(d);
    };
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    await screen.findByText('Lucía R.');
    release();

    await waitFor(async () => expect((await drafts.load())?.athlete).toBeUndefined());
    expect(profiles).toBeDefined();
  });

  it('a failed list read after a save shows no save error and clears the form', async () => {
    const { mount, athletes } = setup();
    await mount();
    jest.spyOn(athletes, 'listManaged').mockRejectedValue(new Error('read failed'));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

    await waitFor(() => expect(screen.getByLabelText('Nombre').props.value).toBe(''));
    expect(screen.queryByText('No pudimos guardar el deportista. Inténtalo de nuevo.')).toBeNull();
  });

  describe('Android back button', () => {
    afterEach(() => jest.restoreAllMocks());

    // Records the subscriptions the container makes, so a test can press back and count removals.
    function spyOnBack() {
      const subscriptions: { event: string; handler: Parameters<typeof BackHandler.addEventListener>[1]; remove: jest.Mock }[] = [];
      jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
        const remove = jest.fn();
        subscriptions.push({ event, handler, remove });
        return { remove };
      });
      return subscriptions;
    }

    it('is left to the navigator unless the route asks to block it', async () => {
      const subscriptions = spyOnBack();
      const { mount } = setup();

      await mount();

      expect(subscriptions).toEqual([]);
    });

    it('does nothing when the route blocks it, and stops listening when the screen goes away', async () => {
      const subscriptions = spyOnBack();
      const { mount, onContinue } = setup();
      const view = await mount({ blockSystemBack: true });

      // Handled (true) means the navigator never sees the press; Continuar stays the only way out.
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].event).toBe('hardwareBackPress');
      expect(subscriptions[0].handler(undefined as never)).toBe(true);
      expect(onContinue).not.toHaveBeenCalled();

      await view.unmount();
      expect(subscriptions[0].remove).toHaveBeenCalledTimes(1);
    });

    // The handler the container subscribed last and has not removed: how many were made before is the hook's business, not these tests'.
    const live = (subscriptions: ReturnType<typeof spyOnBack>) => {
      const active = subscriptions.filter((s) => s.remove.mock.calls.length === 0);
      expect(active.length).toBeGreaterThan(0);
      return active[active.length - 1];
    };

    it('while Continuar is failing, back runs onBack instead of being swallowed, and is swallowed again after a retry', async () => {
      const subscriptions = spyOnBack();
      const { mount, drafts, profiles, onBack } = setup();
      await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
      await mount({ blockSystemBack: true });
      await screen.findByText('Lucía R.');
      live(subscriptions)!.handler(undefined as never);
      expect(onBack).not.toHaveBeenCalled();
      const failing = jest.spyOn(drafts, 'save').mockRejectedValue(new Error('store failed'));

      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

      expect(await screen.findByText('No pudimos guardar el avance. Inténtalo de nuevo.')).toBeOnTheScreen();
      expect(live(subscriptions)!.handler(undefined as never)).toBe(true);
      expect(onBack).toHaveBeenCalledTimes(1);

      failing.mockRestore();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      await waitFor(() => expect(screen.queryByText('No pudimos guardar el avance. Inténtalo de nuevo.')).toBeNull());
      // After the retry the press is handled and swallowed again, not left to the navigator.
      expect(live(subscriptions).handler(undefined as never)).toBe(true);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('when adding fails and nobody is added yet, back runs onBack: there is no other way out', async () => {
      const subscriptions = spyOnBack();
      const { mount, profiles, onBack } = setup();
      jest.spyOn(profiles, 'createManagedAthlete').mockRejectedValue(new Error('write failed'));
      await mount({ blockSystemBack: true });
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

      await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

      expect(await screen.findByText('No pudimos guardar el deportista. Inténtalo de nuevo.')).toBeOnTheScreen();
      expect(live(subscriptions)!.handler(undefined as never)).toBe(true);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('when adding fails but someone is already added, Continuar is the way out and back stays swallowed', async () => {
      const subscriptions = spyOnBack();
      const { mount, profiles, onBack } = setup();
      await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
      jest.spyOn(profiles, 'createManagedAthlete').mockRejectedValue(new Error('write failed'));
      await mount({ blockSystemBack: true });
      await screen.findByText('Mateo G.');
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

      await fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));

      expect(await screen.findByText('No pudimos guardar el deportista. Inténtalo de nuevo.')).toBeOnTheScreen();
      live(subscriptions)!.handler(undefined as never);
      expect(onBack).not.toHaveBeenCalled();
    });

    // A list that could not be read says nothing about who is added: a missing datum is not zero.
    it('when the list cannot be read and adding fails, back stays swallowed: someone may already be added', async () => {
      const subscriptions = spyOnBack();
      const { mount, profiles, athletes, onBack } = setup();
      await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
      jest.spyOn(athletes, 'listManaged').mockRejectedValue(new Error('read failed'));
      jest.spyOn(profiles, 'createManagedAthlete').mockRejectedValue(new Error('write failed'));
      await mount({ blockSystemBack: true });
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

      await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

      expect(await screen.findByText('No pudimos guardar el deportista. Inténtalo de nuevo.')).toBeOnTheScreen();
      expect(live(subscriptions).handler(undefined as never)).toBe(true);
      expect(onBack).not.toHaveBeenCalled();
    });

    it('once the list reads again and nobody is added, a failed add lets back leave', async () => {
      const subscriptions = spyOnBack();
      const { mount, profiles, athletes, onBack } = setup();
      const reading = jest.spyOn(athletes, 'listManaged').mockRejectedValueOnce(new Error('read failed'));
      jest.spyOn(profiles, 'createManagedAthlete').mockRejectedValueOnce(new Error('write failed'));
      await mount({ blockSystemBack: true });
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
      await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
      await screen.findByText('No pudimos guardar el deportista. Inténtalo de nuevo.');
      expect(live(subscriptions).handler(undefined as never)).toBe(true);
      expect(onBack).not.toHaveBeenCalled();

      // The retry saves (nothing was lost) and its read works: the list is known again.
      await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
      await screen.findByText('Lucía R.');
      // The list is known again: Continuar is enabled because Lucía is listed, not because the read failed.
      expect(screen.getByRole('button', { name: 'Continuar' }).props.accessibilityState.disabled).toBeFalsy();
      reading.mockRestore();
      jest.spyOn(profiles, 'createManagedAthlete').mockRejectedValue(new Error('write failed'));
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Mateo');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Gil');
      await fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));
      await screen.findByText('No pudimos guardar el deportista. Inténtalo de nuevo.');

      // Lucía is added, so Continuar is the way out and back stays swallowed.
      live(subscriptions).handler(undefined as never);
      expect(onBack).not.toHaveBeenCalled();
    });
  });

  describe('Continuar when the list cannot be read', () => {
    it('stays available and goes on: a list that could not be read is not an empty one', async () => {
      const { mount, onContinue, athletes, profiles } = setup();
      await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
      jest.spyOn(athletes, 'listManaged').mockRejectedValue(new Error('read failed'));
      await mount();

      const button = await screen.findByRole('button', { name: 'Continuar' });
      expect(button.props.accessibilityState.disabled).toBeFalsy();
      await fireEvent.press(button);

      await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    });

    it('stays disabled when the list reads fine and nobody is added', async () => {
      const { mount, onContinue } = setup();
      await mount();

      const button = await screen.findByRole('button', { name: /^Continuar/ });
      await waitFor(() => expect(button.props.accessibilityState.disabled).toBe(true));
      await fireEvent.press(button);

      expect(onContinue).not.toHaveBeenCalled();
    });
  });

  describe('an add in flight and Continuar block each other', () => {
    it('Continuar does nothing while an add is saving', async () => {
      const { mount, onContinue, drafts, profiles } = setup();
      await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
      const create = profiles.createManagedAthlete.bind(profiles);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
        await gate;
        return create(input);
      });
      await mount();
      await screen.findByText('Mateo G.');
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
      const save = jest.spyOn(drafts, 'save');
      save.mockClear();

      fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(true));
      // Continuar shows it is waiting instead of swallowing the tap.
      expect(screen.getByRole('button', { name: 'Continuar' }).props.accessibilityState.busy).toBe(true);
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      release();
      await screen.findByText('Lucía R.');

      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(false));

      expect(onContinue).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'authorizations' }));
    });

    it('Agregar does nothing while Continuar is saving', async () => {
      const { mount, onContinue, drafts, profiles } = setup();
      await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
      const create = jest.spyOn(profiles, 'createManagedAthlete');
      await mount();
      await screen.findByText('Mateo G.');
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const real = drafts.save.bind(drafts);
      jest.spyOn(drafts, 'save').mockImplementation(async (d) => {
        await gate;
        return real(d);
      });

      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' }).props.accessibilityState.busy).toBe(true));
      // The add card shows it is waiting instead of swallowing the tap.
      expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(true);
      await fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));
      release();

      await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
      expect(create).not.toHaveBeenCalled();
    });

    it('a double tap on Agregar saves the athlete once', async () => {
      const { mount, profiles } = setup();
      const create = profiles.createManagedAthlete.bind(profiles);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const spy = jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
        await gate;
        return create(input);
      });
      await mount();
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

      // Both taps land in the same tick, before the card shows it is busy.
      const button = screen.getByRole('button', { name: 'Agregar deportista' });
      await act(async () => {
        void fireEvent.press(button);
        void fireEvent.press(button);
      });
      release();
      await screen.findByText('Lucía R.');

      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(false));

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('a late read never overwrites a newer one', async () => {
    const { mount, athletes } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // The first read (the one on mount) is slow and answers with the list as it was: empty.
    jest.spyOn(athletes, 'listManaged').mockImplementationOnce(async () => {
      await gate;
      return [];
    });
    await mount();

    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    await screen.findByText('Lucía R.');
    await act(async () => {
      release();
      await gate;
    });

    expect(screen.getByText('Lucía R.')).toBeOnTheScreen();
  });

  describe('what was typed while a profile was saving', () => {
    async function addWhileTyping(next: { firstName: string; lastName: string }) {
      const { mount, drafts, profiles } = setup();
      const create = profiles.createManagedAthlete.bind(profiles);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
        await gate;
        return create(input);
      });
      await mount();
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
      fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar deportista' }).props.accessibilityState.busy).toBe(true));
      await fireEvent.changeText(screen.getByLabelText('Nombre'), next.firstName);
      await fireEvent.changeText(screen.getByLabelText('Apellido'), next.lastName);
      release();
      await screen.findByText('Lucía R.');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(false));
      return { drafts };
    }

    it('is kept in the form and in the draft; only the saved names are cleared', async () => {
      const { drafts } = await addWhileTyping({ firstName: 'Mateo', lastName: 'Gil' });

      expect(screen.getByDisplayValue('Mateo')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('Gil')).toBeOnTheScreen();
      await waitFor(async () => expect((await drafts.load())?.athlete).toEqual({ firstName: 'Mateo', lastName: 'Gil' }));
    });

    it('a field left untouched is cleared and a field that changed is kept', async () => {
      const { drafts } = await addWhileTyping({ firstName: 'Mateo', lastName: 'Rojas' });

      expect(screen.getByDisplayValue('Mateo')).toBeOnTheScreen();
      expect(screen.getByLabelText('Apellido').props.value).toBe('');
      await waitFor(async () => expect((await drafts.load())?.athlete).toEqual({ firstName: 'Mateo', lastName: '' }));
    });
  });

  it('after Continuar fails, Continuar and Agregar both work again: nothing stays blocked', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
    await mount();
    await screen.findByText('Mateo G.');
    const failing = jest.spyOn(drafts, 'save').mockRejectedValue(new Error('store failed'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByText('No pudimos guardar el avance. Inténtalo de nuevo.');

    // The failure released both guards and the busy state.
    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next.props.accessibilityState.busy).toBe(false);
    expect(next.props.accessibilityState.disabled).toBe(false);
    expect(onContinue).not.toHaveBeenCalled();
    failing.mockRestore();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));
    expect(await screen.findByText('Lucía R.')).toBeOnTheScreen();
  });

  it('Continuar stays on the screen with an error when the draft cannot even be read', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Gil', relation: 'guardian' });
    await mount();
    await screen.findByText('Mateo G.');
    jest.spyOn(drafts, 'load').mockRejectedValue(new Error('store failed'));

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('No pudimos guardar el avance. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continuar' }).props.accessibilityState.busy).toBe(false);
  });

  it('a double tap on Continuar keeps the step once and continues once, and the button is busy meanwhile', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await mount();
    await screen.findByText('Lucía R.');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const real = drafts.save.bind(drafts);
    const save = jest.spyOn(drafts, 'save');
    save.mockImplementation(async (d) => {
      await gate;
      return real(d);
    });

    // Both presses land before the first save settles.
    fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' }).props.accessibilityState.busy).toBe(true));
    fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    release();

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(save).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
