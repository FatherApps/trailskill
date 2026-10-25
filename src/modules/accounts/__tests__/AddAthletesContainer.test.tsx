import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { AddAthletesContainer } from '../screens/AddAthletesContainer';

// The accounts index reaches the PowerSync repositories; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, writeBatch: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

function setup() {
  const rows: ManagedAthleteRow[] = [];
  const athletes = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(rows));
  const profiles = createInMemoryManagedAthleteProfileRepository(athletes, rows);
  const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: '' });
  const onContinue = jest.fn();
  const mount = () =>
    render(<AddAthletesContainer userId="guardian-1" profiles={profiles} athletes={athletes} drafts={drafts} onContinue={onContinue} onBack={jest.fn()} />);
  return { mount, onContinue, drafts, profiles, athletes };
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

    expect(await screen.findByLabelText('Lucía R., Hijo o hija')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Agregar otro deportista' })).toBeOnTheScreen();
    expect(screen.queryByText(/documento|nacimiento/i)).toBeNull();
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

  it('Continuar keeps the swimmer choice in the draft, drops the typed names and goes on', async () => {
    const { mount, onContinue, drafts, profiles } = setup();
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await mount();
    await screen.findByLabelText('Lucía R., Hijo o hija');

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(await drafts.load()).toEqual({ swimmer: 'child', firstName: '', lastName: '', email: '' });
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
    await screen.findByLabelText('Lucía R., Hijo o hija');
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
});
