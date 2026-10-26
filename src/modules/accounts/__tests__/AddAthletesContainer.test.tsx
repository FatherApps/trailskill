import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
  const mount = () =>
    render(
      <AddAthletesContainer
        userId="guardian-1"
        profiles={profiles}
        athletes={athletes}
        drafts={drafts}
        invitations={invitations}
        pending={pending}
        onContinue={onContinue}
      />,
    );
  return { mount, onContinue, drafts, profiles, athletes, rows, pending, invitations };
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

  it('the Android back button does nothing here and stops listening when the screen goes away', async () => {
    const remove = jest.fn();
    let handler: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, listener) => {
      handler = listener;
      return { remove };
    });
    const { mount, onContinue } = setup();
    const view = await mount();

    // Handled (true) means the navigator never sees the press; Continuar stays the only way out.
    expect(handler?.(undefined as never)).toBe(true);
    expect(onContinue).not.toHaveBeenCalled();

    await view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
