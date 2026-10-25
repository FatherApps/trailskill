import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { AddAthletesContainer, type AthleteDraftStore } from '../screens/AddAthletesContainer';

// The accounts index reaches the PowerSync repositories; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, writeBatch: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

function setup() {
  const rows: ManagedAthleteRow[] = [];
  const athletes = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(rows));
  const profiles = createInMemoryManagedAthleteProfileRepository(athletes, rows);
  let stored: Awaited<ReturnType<AthleteDraftStore['load']>> = null;
  const draft: AthleteDraftStore = { load: async () => stored, save: async (next) => void (stored = next) };
  const onContinue = jest.fn();
  const mount = () =>
    render(<AddAthletesContainer userId="guardian-1" relation="guardian" profiles={profiles} athletes={athletes} draft={draft} onContinue={onContinue} onBack={jest.fn()} />);
  return { mount, onContinue };
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
    first.unmount();

    await mount();

    expect(await screen.findByDisplayValue('Lucía')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Rojas')).toBeOnTheScreen();
  });
});
