import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton, unavailableTimingButton } from '../../timing';
import { SettingsContainer } from '../screens/SettingsContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));

async function setup(buttons = createFakeTimingButton().port) {
  const repository = createInMemoryPreferencesRepository();
  const onBack = jest.fn();
  await render(
    <PreferencesProvider repository={repository}>
      <SettingsContainer onBack={onBack} buttons={buttons} />
    </PreferencesProvider>,
  );
  return { repository, onBack };
}

describe('SettingsContainer timing buttons', () => {
  it('learns a new start key from the next press and saves it', async () => {
    const fake = createFakeTimingButton();
    const { repository } = await setup(fake.port);
    await fireEvent.press(screen.getByText('Cambiar Iniciar y detener'));
    expect(fake.mode).toBe('learn');

    await act(async () => void fake.press(79));

    expect(screen.getByText('Iniciar y detener: Botón del auricular')).toBeTruthy();
    await waitFor(async () => expect((await repository.load()).timingButtons.startKey).toBe(79));
    expect(fake.mode).toBe('off');
  });

  it('gives the keys back when choosing is cancelled or the screen closes', async () => {
    const fake = createFakeTimingButton();
    const { onBack } = await setup(fake.port);
    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(fake.mode).toBe('off');

    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(fake.mode).toBe('off');
    expect(onBack).toHaveBeenCalled();
  });

  it('names an unknown key by its number', async () => {
    const fake = createFakeTimingButton();
    await setup(fake.port);
    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    await act(async () => void fake.press(131));
    expect(screen.getByText('Parcial: Tecla 131')).toBeTruthy();
  });

  it('shows no timing buttons where the phone cannot use them', async () => {
    await setup(unavailableTimingButton);
    expect(screen.queryByText('Botones para cronometrar')).toBeNull();
  });
});

describe('SettingsContainer video recording', () => {
  it('saves each change, keeping the other video settings', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByText('Alta 1080p'));
    await waitFor(async () => expect((await repository.load()).videoRecording.quality).toBe('high'));
    await fireEvent.press(within(screen.getByLabelText('Parar el video después de detener el reloj')).getByText('10 s'));
    await waitFor(async () =>
      expect((await repository.load()).videoRecording).toEqual({ quality: 'high', audio: true, startWithTime: false, stopAfterSeconds: 10 }),
    );
  });
});
