import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ThemeProvider } from '../../../core/theme';
import { createInMemoryManagedAthleteRepository } from '../../accounts';
import { AthleteEditScreen, AthleteNameContainer, createInMemoryAthleteRepository, type AthleteRepository, type SchoolAthlete } from '..';

// Synthetic data only. The local database is faked: the sync state is whatever the test sets.
let mockSyncState = 'synced';
jest.mock('../../../core/sync', () => ({
  db: {},
  useRecordSyncState: () => mockSyncState,
  RecordSyncStatus: ({ table, id }: { table: string; id: string }) => {
    const { Text: Label } = jest.requireActual('react-native');
    return <Label>{`sync ${table} ${id} ${mockSyncState}`}</Label>;
  },
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const rows = (): SchoolAthlete[] => [{ id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [], endedAt: null }];

async function setup(options: { repository?: AthleteRepository; onRenamed?: () => void } = {}) {
  const repository = options.repository ?? createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository([]), rows());
  const renameProfile = jest.spyOn(repository, 'renameProfile');
  const onRenamed = options.onRenamed ?? jest.fn();
  await render(
    <ThemeProvider>
      <AthleteNameContainer athleteId="a1" firstName="Ana" lastName="Marin" repository={repository} onRenamed={onRenamed} />
    </ThemeProvider>,
  );
  return { repository, renameProfile, onRenamed };
}

const first = () => screen.getByLabelText('Nombre');
const last = () => screen.getByLabelText('Apellido');
const save = () => screen.getByRole('button', { name: /^Guardar/ });

beforeEach(() => {
  mockSyncState = 'synced';
});

describe('AthleteNameContainer', () => {
  it('prefills both names, keeps Guardar off until something changes, and shows no sync state yet', async () => {
    await setup();

    expect(first().props.value).toBe('Ana');
    expect(last().props.value).toBe('Marin');
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText(/^sync /)).toBeNull();
  });

  it('keeps Guardar off, and says why, when a name is empty after trimming', async () => {
    await setup();

    await fireEvent.changeText(first(), '   ');
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Escribe el nombre.')).toBeOnTheScreen();

    await fireEvent.changeText(first(), 'Lucía');
    await fireEvent.changeText(last(), '');
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Escribe el apellido.')).toBeOnTheScreen();
  });

  it('keeps Guardar off when the names only differ in surrounding spaces', async () => {
    await setup();

    await fireEvent.changeText(first(), '  Ana ');
    expect(save().props.accessibilityState.disabled).toBe(true);
  });

  it('saves the names without the extra spaces, once, and tells the route', async () => {
    const { renameProfile, onRenamed } = await setup();

    await fireEvent.changeText(first(), '  Lucía ');
    await fireEvent.changeText(last(), ' Gómez  ');
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());

    expect(renameProfile).toHaveBeenCalledTimes(1);
    expect(renameProfile).toHaveBeenCalledWith('a1', { firstName: 'Lucía', lastName: 'Gómez' });
    expect(onRenamed).toHaveBeenCalledTimes(1);
  });

  it('shows the sync state of the swimmer after saving, even offline, and turns Guardar off again', async () => {
    mockSyncState = 'on_device';
    await setup();

    await fireEvent.changeText(first(), 'Lucía');
    await fireEvent.press(save());

    expect(await screen.findByText('sync athletes a1 on_device')).toBeOnTheScreen();
    expect(save().props.accessibilityState.disabled).toBe(true);
  });

  it('shows a rejected edit when the screen is opened again, with no new save', async () => {
    mockSyncState = 'not_sent';
    await setup();

    expect(screen.getByText('sync athletes a1 not_sent')).toBeOnTheScreen();
  });

  it('says it could not save when the repository fails, and keeps what was typed', async () => {
    const repository = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository([]), rows());
    jest.spyOn(repository, 'renameProfile').mockRejectedValue(new Error('disk full'));
    const { onRenamed } = await setup({ repository });

    await fireEvent.changeText(first(), 'Lucía');
    await fireEvent.press(save());

    expect(await screen.findByText('No pudimos guardar el nombre. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(first().props.value).toBe('Lucía');
    expect(onRenamed).not.toHaveBeenCalled();
  });
});

describe('the edit screen after a rename', () => {
  // What the route does: after the save it reads the local database again and hands the screen the names it finds.
  function Route({ repository }: { repository: AthleteRepository }) {
    const [athlete, setAthlete] = useState<SchoolAthlete>({ id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [], endedAt: null });
    return (
      <AthleteEditScreen
        athleteId="a1"
        firstName={athlete.firstName}
        lastName={athlete.lastName}
        onBack={jest.fn()}
        onDone={jest.fn()}
        name={
          <AthleteNameContainer
            athleteId="a1"
            firstName={athlete.firstName}
            lastName={athlete.lastName}
            repository={repository}
            onRenamed={() => void repository.listOnDevice().then(([found]) => setAthlete(found))}
          />
        }
      />
    );
  }

  it('titles the screen with the new name once the local database is read again, and the list reads it too', async () => {
    const repository = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository([]), rows());
    await render(
      <ThemeProvider>
        <Route repository={repository} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('header', { name: 'Editar a Ana Marin' })).toBeOnTheScreen();

    await fireEvent.changeText(first(), 'Lucía');
    await fireEvent.changeText(last(), 'Gómez');
    await act(async () => {
      fireEvent.press(save());
    });

    expect(await screen.findByRole('header', { name: 'Editar a Lucía Gómez' })).toBeOnTheScreen();
    expect(await repository.listOnDevice()).toEqual([expect.objectContaining({ firstName: 'Lucía', lastName: 'Gómez' })]);
    expect(save().props.accessibilityState.disabled).toBe(true);
  });
});
