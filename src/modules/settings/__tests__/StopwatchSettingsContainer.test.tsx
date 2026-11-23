import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, defaultTimingButtons, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton, unavailableTimingButton } from '../../timing';
import { StopwatchSettingsContainer } from '../screens/StopwatchSettingsContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));

async function setup(buttons = createFakeTimingButton().port) {
  const repository = createInMemoryPreferencesRepository();
  const onBack = jest.fn();
  const view = await render(
    <PreferencesProvider repository={repository}>
      <StopwatchSettingsContainer onBack={onBack} buttons={buttons} />
    </PreferencesProvider>,
  );
  return { repository, onBack, view };
}

describe('StopwatchSettingsContainer', () => {
  it('saves the free laps on this phone, keeping the other preferences, even without the buttons', async () => {
    const { repository } = await setup(unavailableTimingButton);
    await fireEvent.press(screen.getByRole('switch', { name: 'Laps libres' }));
    await waitFor(async () => expect(await repository.load()).toEqual({ ...defaultPreferences, freeLaps: true }));
  });

  it('saves the precision, keeping the other preferences, even without the buttons', async () => {
    const { repository } = await setup(unavailableTimingButton);
    await fireEvent.press(screen.getByText('Milésimas'));
    await waitFor(async () => expect(await repository.load()).toEqual({ ...defaultPreferences, timePrecision: 'thousandths' }));
  });

  it('saves the vibration, keeping the other button settings', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByRole('switch', { name: 'Vibrar al marcar' }));
    await waitFor(async () => expect((await repository.load()).timingButtons).toEqual({ ...defaultTimingButtons, vibrate: false }));
  });

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

  it("gives the keys back when the screen goes away with Android's back", async () => {
    const fake = createFakeTimingButton();
    const { view } = await setup(fake.port);
    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    expect(fake.mode).toBe('learn');

    await view.unmount();

    expect(fake.mode).toBe('off');
  });

  it('names an unknown key by its number', async () => {
    const fake = createFakeTimingButton();
    await setup(fake.port);
    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    await act(async () => void fake.press(131));
    expect(screen.getByText('Parcial: Tecla 131')).toBeTruthy();
  });

  it('saves turning the buttons off', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByRole('switch', { name: 'Botones para cronometrar' }));
    await waitFor(async () => expect((await repository.load()).timingButtons.enabled).toBe(false));
  });
});
