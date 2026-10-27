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
const invitation = { school: 'Escuela Delfines', group: 'Infantil B', categories: [
    { id: 'cat-1', name: '9-10' },
    { id: 'cat-2', name: '11-12' },
  ],
};

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

// A draft that was saved before the screen started and whose reads are slow: the screen shows the form, the person types, and the read answers afterwards with the draft as it was.
// `fast()` makes the reads after that instant (the saves after typing); without it every read waits for `open()`.
async function slowStartDraft(drafts: ReturnType<typeof setup>['drafts']) {
  await drafts.save({ ...(await drafts.load())!, athlete: { firstName: 'Anterior', lastName: 'Guardado' } });
  const real = drafts.load.bind(drafts);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let slow = true;
  jest.spyOn(drafts, 'load').mockImplementation(async () => {
    const wait = slow;
    const snapshot = await real();
    if (wait) await gate;
    return snapshot;
  });
  return {
    real,
    fast: () => {
      slow = false;
    },
    open: () =>
      act(async () => {
        release();
        await gate;
      }),
  };
}

// Waits for the first read the screen starts after `reads` calls, and for the code that was waiting for it: its continuation was queued on that promise before ours, so by the time we resume it has either saved or left.
async function afterNextRead(drafts: ReturnType<typeof setup>['drafts'], reads: number) {
  const load = jest.mocked(drafts.load);
  await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(reads));
  await load.mock.results[reads].value;
}

// Every read waits until the test lets it go, and answers with the draft in force at that instant, as a slow store does.
function heldReads(drafts: ReturnType<typeof setup>['drafts']) {
  const real = drafts.load.bind(drafts);
  const releases: (() => void)[] = [];
  jest.spyOn(drafts, 'load').mockImplementation(() => new Promise((resolve) => releases.push(() => resolve(real()))));
  return releases;
}

// Lets every promise continuation that is ready run, so a read that was released has finished its code before the test goes on.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

// Lets the held reads go and runs what they unblock, until a settled pass finds none held: reads that start from the ones released are drained too, with no fixed number of turns.
async function drainReads(releases: (() => void)[], { newestFirst = false } = {}) {
  for (;;) {
    await settle();
    if (!releases.length) return;
    const batch = releases.splice(0);
    for (const release of newestFirst ? batch.reverse() : batch) {
      release();
      await settle();
    }
  }
}

// Leaves the screen while an add saves and no read has ended (so it knows no origin), lets the add end and every read after it, and returns the athlete the draft holds afterwards.
async function draftAfterAddEndedAfterUnmount(
  { mount, drafts, profiles }: ReturnType<typeof setup>,
  inDraft: { firstName: string; lastName: string },
) {
  await drafts.save({ ...(await drafts.load())!, athlete: inDraft });
  const real = drafts.load.bind(drafts);
  const create = profiles.createManagedAthlete.bind(profiles);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
    await gate;
    return create(input);
  });
  const releases = heldReads(drafts);
  const view = await mount();
  await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
  await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
  fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar deportista' }).props.accessibilityState.busy).toBe(true));
  await view.unmount();

  await act(async () => {
    release();
    await gate;
  });
  // Every read, the ones the add starts after it saved included, ends now.
  await drainReads(releases);
  return (await real())?.athlete;
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

  it('the choice starting over after an add is not a choice: the next athlete is accepted with no category', async () => {
    const { mount, rows, invitations } = setup('tok-1');
    await mount();
    await fireEvent.press(await screen.findByRole('radio', { name: '9-10' }));
    await addLucia();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Sin categoría' }).props.accessibilityState.checked).toBe(true));

    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Mateo');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));

    await waitFor(() => expect(invitations.accepted).toHaveLength(2));
    expect(invitations.accepted[1]).toEqual({ token: 'tok-1', athleteId: rows[1].athleteId });
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

    // The one handler the container has subscribed and not removed: a second live one is a leak, and BackHandler would run both.
    const live = (subscriptions: ReturnType<typeof spyOnBack>) => {
      const active = subscriptions.filter((s) => s.remove.mock.calls.length === 0);
      expect(active).toHaveLength(1);
      return active[0];
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
    async function addWhileTyping(next: { firstName?: string; lastName?: string }) {
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
      if (next.firstName !== undefined) await fireEvent.changeText(screen.getByLabelText('Nombre'), next.firstName);
      if (next.lastName !== undefined) await fireEvent.changeText(screen.getByLabelText('Apellido'), next.lastName);
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

    it('a field left untouched is cleared and a field that was typed is kept', async () => {
      const { drafts } = await addWhileTyping({ firstName: 'Mateo' });

      expect(screen.getByDisplayValue('Mateo')).toBeOnTheScreen();
      expect(screen.getByLabelText('Apellido').props.value).toBe('');
      await waitFor(async () => expect((await drafts.load())?.athlete).toEqual({ firstName: 'Mateo', lastName: '' }));
    });

    it('a last name typed again with the same value (a sibling) is kept, not cleared as if untouched', async () => {
      const { drafts } = await addWhileTyping({ firstName: 'Mateo', lastName: 'Rojas' });

      expect(screen.getByDisplayValue('Mateo')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('Rojas')).toBeOnTheScreen();
      await waitFor(async () => expect((await drafts.load())?.athlete).toEqual({ firstName: 'Mateo', lastName: 'Rojas' }));
    });

    it('the category chosen meanwhile is kept for the next athlete and the saved one goes with the saved athlete', async () => {
      const { mount, profiles, rows, invitations } = setup('tok-1');
      const create = profiles.createManagedAthlete.bind(profiles);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
        await gate;
        return create(input);
      });
      await mount();
      await fireEvent.press(await screen.findByRole('radio', { name: '9-10' }));
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
      fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar deportista' }).props.accessibilityState.busy).toBe(true));
      await fireEvent.press(screen.getByRole('radio', { name: '11-12' }));
      release();
      await screen.findByText('Lucía R.');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(false));

      expect(screen.getByRole('radio', { name: '11-12' }).props.accessibilityState.checked).toBe(true);
      await waitFor(() => expect(invitations.accepted).toEqual([{ token: 'tok-1', athleteId: rows[0].athleteId, categoryId: 'cat-1' }]));
    });

    // Adds Lucía Rojas with `first` chosen while the add is held, makes `choices` meanwhile, lets the add end and adds Mateo Rojas as the next athlete.
    // The screen goes before the gate opens, so a failing assertion cannot leave the held add running on a live screen; the same when mounting throws, which must still open the gate.
    // `kept` is the category still chosen once the first athlete is added, or null when the choice started over.
    async function addTwoChoosing(first: string, choices: string[], kept: string | null) {
      const { mount, profiles, rows, pending, invitations } = setup('tok-1');
      const create = profiles.createManagedAthlete.bind(profiles);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(profiles, 'createManagedAthlete').mockImplementationOnce(async (input) => {
        await gate;
        return create(input);
      });
      let unmount: (() => void) | undefined;
      try {
        ({ unmount } = await mount());
        await fireEvent.press(await screen.findByRole('radio', { name: first }));
        // The categories are loaded; from here the acceptances stay queued, so what was saved can be read.
        invitations.offline = true;
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
        await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
        fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar deportista' }).props.accessibilityState.busy).toBe(true));
        for (const name of choices) await fireEvent.press(screen.getByRole('radio', { name }));
        release();
        await screen.findByText('Lucía R.');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar otro deportista' }).props.accessibilityState.busy).toBe(false));
        for (const { name } of invitation.categories) {
          expect(screen.getByRole('radio', { name }).props.accessibilityState.checked).toBe(name === kept);
        }

        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Mateo');
        await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
        await fireEvent.press(screen.getByRole('button', { name: 'Agregar otro deportista' }));
        await screen.findByText('Mateo R.');
      } finally {
        unmount?.();
        release();
      }
      return { rows, pending, invitations };
    }

    it('changing the category while the add is pending: the first athlete is saved and queued with the original, the next one with the new', async () => {
      const { rows, pending, invitations } = await addTwoChoosing('9-10', ['11-12'], '11-12');

      expect(rows).toHaveLength(2);
      await waitFor(async () =>
        expect(await pending.list()).toEqual([
          { userId: 'guardian-1', token: 'tok-1', athleteId: rows[0].athleteId, categoryId: 'cat-1', queuedAt: expect.any(Number) },
          { userId: 'guardian-1', token: 'tok-1', athleteId: rows[1].athleteId, categoryId: 'cat-2', queuedAt: expect.any(Number) },
        ]),
      );
      expect(invitations.accepted).toEqual([]);
    });

    it('choosing 9-10, 11-12 and 9-10 again while the add is pending: every choice counts as an edit, so 9-10 stays for the next athlete', async () => {
      const { pending } = await addTwoChoosing('9-10', ['11-12', '9-10'], '9-10');

      await waitFor(async () => expect((await pending.list()).map((item) => item.categoryId)).toEqual(['cat-1', 'cat-1']));
    });

    it('the same with another category saved: 11-12, 9-10 and 11-12 again keeps 11-12, so it is not tied to the first option nor to comparing the final value', async () => {
      const { pending } = await addTwoChoosing('11-12', ['9-10', '11-12'], '11-12');

      await waitFor(async () => expect((await pending.list()).map((item) => item.categoryId)).toEqual(['cat-2', 'cat-2']));
    });

    // The control of the two above: same saved category, no choice meanwhile. They keep it because it was edited, not because nothing ever clears it.
    it('the same category saved with no choice meanwhile starts over, so the next athlete has none', async () => {
      const { pending } = await addTwoChoosing('11-12', [], null);

      await waitFor(async () => expect((await pending.list()).map((item) => item.categoryId)).toEqual(['cat-2', undefined]));
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

  it('Continuar keeps the names typed for the next athlete in the draft', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await mount();
    await screen.findByText('Lucía R.');
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Mateo');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(await drafts.load()).toEqual({ swimmer: 'child', firstName: '', lastName: '', email: '', step: 'authorizations', athlete: { firstName: 'Mateo', lastName: 'Rojas' } });
  });

  it('a draft that loads late never overwrites what the person already typed', async () => {
    const { mount, drafts } = setup();
    // The reads while the screen starts are slow and answer with the draft as it was before typing.
    const slow = await slowStartDraft(drafts);
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');

    await slow.open();

    expect(screen.getByLabelText('Nombre').props.value).toBe('Lucía');
    expect(screen.getByLabelText('Apellido').props.value).toBe('Rojas');
  });

  it('a draft that loads late keeps the field the person did not edit and drops only the edited one', async () => {
    const { mount, drafts } = setup();
    const slow = await slowStartDraft(drafts);
    const save = jest.spyOn(drafts, 'save');
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');

    await slow.open();

    expect(screen.getByLabelText('Nombre').props.value).toBe('Lucía');
    expect(screen.getByLabelText('Apellido').props.value).toBe('Guardado');
    // The keystroke save wrote only the edited field: the kept one must be written back or a restart loses it.
    await waitFor(async () => expect((await slow.real())?.athlete).toEqual({ firstName: 'Lucía', lastName: 'Guardado' }));
    // One save per write, in order: the keystroke, then the write-back of the kept field.
    expect(save.mock.calls.map(([draft]) => draft.athlete)).toEqual([
      { firstName: 'Lucía', lastName: '' },
      { firstName: 'Lucía', lastName: 'Guardado' },
    ]);
  });

  it('a draft that loads after the screen went away still gets the field the person did not edit written back', async () => {
    const { mount, drafts } = setup();
    const slow = await slowStartDraft(drafts);
    const save = jest.spyOn(drafts, 'save');
    const view = await mount();
    // Only the reads the screen starts with are slow; the saves after typing read the draft at once.
    slow.fast();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await view.unmount();

    await slow.open();

    // The draft the person left must keep the field they did not edit, mounted or not.
    await waitFor(async () => expect((await slow.real())?.athlete).toEqual({ firstName: 'Lucía', lastName: 'Guardado' }));
    expect(save.mock.calls.map(([draft]) => draft.athlete)).toEqual([
      { firstName: 'Lucía', lastName: '' },
      { firstName: 'Lucía', lastName: 'Guardado' },
    ]);
  });

  it('a draft that loads after the screen went away never writes into a registration started after it', async () => {
    const { mount, drafts } = setup();
    const slow = await slowStartDraft(drafts);
    const save = jest.spyOn(drafts, 'save');
    const view = await mount();
    slow.fast();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await view.unmount();
    // The registration is discarded and another one starts while the first read is still slow.
    const another = { swimmer: 'adult' as const, firstName: 'Nuevo', lastName: 'Registro', email: 'nuevo@example.com' };
    await drafts.clear();
    await drafts.save(another);
    const load = jest.mocked(drafts.load);
    const [reads, saves] = [load.mock.calls.length, save.mock.calls.length];

    await slow.open();

    // The write-back looked at the draft in force and left it alone.
    await afterNextRead(drafts, reads);
    expect(save).toHaveBeenCalledTimes(saves);
    expect(await slow.real()).toEqual(another);
  });

  it('a registration started after the screen went away is left alone even when no read ended while the screen was there', async () => {
    const { mount, drafts } = setup();
    const save = jest.spyOn(drafts, 'save');
    const releases = heldReads(drafts);
    const view = await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await settle();
    // Nothing ends until released, so the reads held are the ones the screen started: its first one, the invitation's and the keystroke save's. Zero would pass without checking anything.
    expect(releases).toHaveLength(3);
    await view.unmount();
    const another = { swimmer: 'adult' as const, firstName: 'Nuevo', lastName: 'Registro', email: 'nuevo@example.com' };
    await drafts.clear();
    await drafts.save(another);
    const saves = save.mock.calls.length;

    // Newest first: the keystroke save reads the new registration before any other read ends, and with no origin known it is not this screen's.
    // The reads that end after it (the screen's first one included) are no origin either, so nothing is written back from them.
    await drainReads(releases, { newestFirst: true });

    expect(save).toHaveBeenCalledTimes(saves);
  });

  // The limit of telling registrations apart by their fields (issue 611): a registration started again with the same data cannot be told from the one the screen belonged to.
  it('a registration restarted with the same fields still receives the late write-back (known limit)', async () => {
    const { mount, drafts } = setup();
    const slow = await slowStartDraft(drafts);
    const save = jest.spyOn(drafts, 'save');
    const view = await mount();
    slow.fast();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await view.unmount();
    // Discarded and started again with the very same data.
    const first = (await slow.real())!;
    await drafts.clear();
    await drafts.save({ swimmer: first.swimmer, firstName: first.firstName, lastName: first.lastName, email: first.email, invitationToken: first.invitationToken });
    const reads = jest.mocked(drafts.load).mock.calls.length;

    await slow.open();
    await afterNextRead(drafts, reads);

    expect((await slow.real())?.athlete).toEqual({ firstName: 'Lucía', lastName: 'Guardado' });
  });

  it('a draft that loads late writes nothing back when the keystroke saves already left it as the form shows it', async () => {
    const { mount, drafts } = setup();
    const slow = await slowStartDraft(drafts);
    const save = jest.spyOn(drafts, 'save');
    await mount();
    slow.fast();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const reads = jest.mocked(drafts.load).mock.calls.length;

    await slow.open();
    await afterNextRead(drafts, reads);

    expect(save).toHaveBeenCalledTimes(2);
    expect((await slow.real())?.athlete).toEqual({ firstName: 'Lucía', lastName: 'Rojas' });
  });

  // Pins the issue edge of a slow draft after a whole add: it cannot happen today (an add needs both fields typed, and the edit counters never reset), so the late draft always loses to what was typed.
  it('a draft that loads after a whole add never brings back a field of the athlete already saved', async () => {
    const { mount, drafts, rows } = setup();
    const slow = await slowStartDraft(drafts);
    const save = jest.spyOn(drafts, 'save');
    await mount();
    slow.fast();
    await addLucia();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Mateo');
    await waitFor(async () => expect((await slow.real())?.athlete).toEqual({ firstName: 'Mateo', lastName: '' }));
    const before = save.mock.calls.length;
    const reads = jest.mocked(drafts.load).mock.calls.length;

    await slow.open();

    expect(rows).toHaveLength(1);
    expect(screen.getByLabelText('Nombre').props.value).toBe('Mateo');
    expect(screen.getByLabelText('Apellido').props.value).toBe('');
    // The late draft writes nothing back: the keystroke save already left only what is in the form, with nothing from the draft the screen started with ('Anterior', 'Guardado') or from the saved athlete ('Lucía', 'Rojas').
    await afterNextRead(drafts, reads);
    expect(save).toHaveBeenCalledTimes(before);
    expect((await slow.real())?.athlete).toEqual({ firstName: 'Mateo', lastName: '' });
  });

  it("a category that goes A, B, A while the athlete saves is the next athlete's choice and is not cleared", async () => {
    const { mount, profiles } = setup('tok-1');
    const create = profiles.createManagedAthlete.bind(profiles);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
      await gate;
      return create(input);
    });
    await mount();
    await fireEvent.press(await screen.findByRole('radio', { name: '9-10' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar deportista' }).props.accessibilityState.busy).toBe(true));
    await fireEvent.press(screen.getByRole('radio', { name: '11-12' }));
    await fireEvent.press(screen.getByRole('radio', { name: '9-10' }));

    await act(async () => {
      release();
      await gate;
    });

    await screen.findByText('Lucía R.');
    expect(screen.getByRole('radio', { name: '9-10' }).props.accessibilityState.checked).toBe(true);
  });

  it('an add that ends after the screen went away saves and queues the athlete but does not read the list again', async () => {
    const { mount, athletes, drafts, profiles } = setup('tok-1');
    const create = profiles.createManagedAthlete.bind(profiles);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    jest.spyOn(profiles, 'createManagedAthlete').mockImplementation(async (input) => {
      await gate;
      return create(input);
    });
    const list = jest.spyOn(athletes, 'listManaged');
    const view = await mount();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar deportista' }).props.accessibilityState.busy).toBe(true));
    const reads = list.mock.calls.length;
    await view.unmount();

    await act(async () => {
      release();
      await gate;
    });

    // The saved names leave the draft, or the next launch would offer to add the same athlete again.
    await waitFor(async () => expect((await drafts.load())?.athlete).toBeUndefined());
    expect(list).toHaveBeenCalledTimes(reads);
  });

  it('an add that ends after the screen went away, before any read ended, still takes the names it saved out of the draft', async () => {
    const athlete = await draftAfterAddEndedAfterUnmount(setup(), { firstName: 'Lucía', lastName: 'Rojas' });

    // The draft held exactly the names that were just saved as a profile: leaving them would offer to add the same athlete again.
    expect(athlete).toBeUndefined();
  });

  it('an add that ends after the screen went away, before any read ended, leaves other names in the draft alone', async () => {
    const athlete = await draftAfterAddEndedAfterUnmount(setup(), { firstName: 'Anterior', lastName: 'Guardado' });

    // Those names were never added: with no origin known they are not this screen's to remove.
    expect(athlete).toEqual({ firstName: 'Anterior', lastName: 'Guardado' });
  });

  // Decision (issue 626): a save that changes nothing does not renew the 24 hours of the draft; only a write that changes it does.
  it('typing what the draft already holds writes nothing, so it does not renew the 24 hours either', async () => {
    const { mount, drafts } = setup();
    await drafts.save({ ...(await drafts.load())!, athlete: { firstName: 'Lucía', lastName: 'Rojas' } });
    const save = jest.spyOn(drafts, 'save');
    await mount();
    await waitFor(() => expect(screen.getByLabelText('Nombre').props.value).toBe('Lucía'));

    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await settle();

    expect(save).not.toHaveBeenCalled();
  });
});
