import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { AthletePrivateDetailsContainer, createInMemoryPrivateDetailsRepository, type PrivateDetailsRepository } from '..';

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

// The phone's LOCAL clock, late in the evening: in Colombia (UTC-5) it is already the next day in UTC.
const TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime'] as const;
beforeEach(() => {
  mockSyncState = 'synced';
  jest.useFakeTimers({ now: new Date(2026, 10, 21, 23, 30), doNotFake: [...TIMERS] });
});
afterEach(() => jest.useRealTimers());

async function setup(options: { repository?: PrivateDetailsRepository; seed?: { birthDate: string | null; gender: 'F' | 'M' | 'undisclosed' | null } } = {}) {
  const repository = options.repository ?? createInMemoryPrivateDetailsRepository();
  if (options.seed) await repository.save('a1', options.seed);
  const save = jest.spyOn(repository, 'save');
  await render(
    <ThemeProvider>
      <AthletePrivateDetailsContainer athleteId="a1" repository={repository} />
    </ThemeProvider>,
  );
  await screen.findByLabelText('Fecha de nacimiento');
  return { repository, save };
}

const date = () => screen.getByLabelText('Fecha de nacimiento');
const save = () => screen.getByRole('button', { name: /^Guardar/ });
const gender = (name: string) => screen.getByRole('radio', { name });

describe('AthletePrivateDetailsContainer', () => {
  it('shows empty fields for a swimmer with nothing saved, with Guardar off and no sync state', async () => {
    await setup();

    expect(date().props.value).toBe('');
    expect(gender('Sin indicar').props.accessibilityState.selected).toBe(true);
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText(/^sync /)).toBeNull();
  });

  it('prefills what the device has for the swimmer, writes the date with the module formatter and keeps Guardar off', async () => {
    await setup({ seed: { birthDate: '2014-05-03', gender: 'F' } });

    expect(date().props.value).toBe('2014-05-03');
    expect(date().props.accessibilityHint).toBe('3 de mayo de 2014');
    expect(gender('Femenino').props.accessibilityState.selected).toBe(true);
    expect(save().props.accessibilityState.disabled).toBe(true);
  });

  it('saves the date and the gender for the swimmer, then shows the sync state of the saved row', async () => {
    const { save: saveSpy } = await setup();

    await fireEvent.changeText(date(), '2014-05-03');
    await fireEvent.press(gender('Masculino'));
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());

    expect(saveSpy).toHaveBeenCalledWith('a1', { birthDate: '2014-05-03', gender: 'M' });
    expect(await screen.findByText('sync athlete_private_details details-1 synced')).toBeOnTheScreen();
    // What was saved is now what the form compares with.
    expect(save().props.accessibilityState.disabled).toBe(true);
  });

  it('keeps the data on the device without a connection and shows that it is waiting to be sent', async () => {
    mockSyncState = 'on_device';
    const { repository } = await setup();

    await fireEvent.changeText(date(), '2014-05-03');
    await fireEvent.press(save());

    expect(await screen.findByText('sync athlete_private_details details-1 on_device')).toBeOnTheScreen();
    expect(await repository.get('a1')).toEqual(expect.objectContaining({ birthDate: '2014-05-03' }));
  });

  it('does not save a future date, and says why, at the edge of the local day', async () => {
    const { save: saveSpy } = await setup();

    // 23:30 local on 2026-11-21: today is the last day that can be saved, even though UTC is already the 22nd.
    await fireEvent.changeText(date(), '2026-11-22');
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('La fecha no puede ser futura.')).toBeOnTheScreen();
    await fireEvent.press(save());
    expect(saveSpy).not.toHaveBeenCalled();

    await fireEvent.changeText(date(), '2026-11-21');
    expect(save().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText('La fecha no puede ser futura.')).toBeNull();
  });

  it('does not save a date before 1900-01-01 or one that is not a real date, but saves 1900-01-01', async () => {
    const { save: saveSpy } = await setup();

    for (const bad of ['1899-12-31', '2014-02-30', '3/5/2014', '2014-5-3']) {
      await fireEvent.changeText(date(), bad);
      expect(save().props.accessibilityState.disabled).toBe(true);
      expect(screen.getByText('Escribe una fecha real, desde 1900-01-01.')).toBeOnTheScreen();
    }
    expect(saveSpy).not.toHaveBeenCalled();

    await fireEvent.changeText(date(), '1900-01-01');
    expect(save().props.accessibilityState.disabled).toBe(false);
  });

  it('can clear the date and the gender again', async () => {
    const { save: saveSpy } = await setup({ seed: { birthDate: '2014-05-03', gender: 'F' } });

    await fireEvent.changeText(date(), '');
    await fireEvent.press(gender('Sin indicar'));
    await fireEvent.press(save());

    expect(saveSpy).toHaveBeenLastCalledWith('a1', { birthDate: null, gender: null });
  });

  it('keeps what was typed and offers another try when the write fails, without printing the values', async () => {
    const repository = createInMemoryPrivateDetailsRepository();
    jest.spyOn(repository, 'save').mockRejectedValueOnce(new Error('disk is full 2014-05-03'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await setup({ repository });

    await fireEvent.changeText(date(), '2014-05-03');
    await fireEvent.press(save());

    expect(await screen.findByText('No pudimos guardar la fecha y el género. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.queryByText(/2014-05-03.*disk|disk is full/)).toBeNull();
    expect(date().props.value).toBe('2014-05-03');
    expect(log).not.toHaveBeenCalled();
    await fireEvent.press(save());
    await act(async () => undefined);
    expect(screen.queryByText('No pudimos guardar la fecha y el género. Inténtalo de nuevo.')).toBeNull();
  });

  it('offers a retry when the device cannot be read', async () => {
    const repository = createInMemoryPrivateDetailsRepository();
    jest.spyOn(repository, 'get').mockRejectedValueOnce(new Error('db locked'));
    await render(
      <ThemeProvider>
        <AthletePrivateDetailsContainer athleteId="a1" repository={repository} />
      </ThemeProvider>,
    );

    await fireEvent.press(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Fecha de nacimiento')).toBeOnTheScreen();
  });
});
