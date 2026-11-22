import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, defaultTimingButtons, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton, unavailableTimingButton } from '../../timing';
import { SettingsContainer } from '../screens/SettingsContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));

async function setup(buttons = createFakeTimingButton().port, repository = createInMemoryPreferencesRepository()) {
  const handlers = { onBack: jest.fn(), onOpenStopwatch: jest.fn(), onOpenVideo: jest.fn() };
  await render(
    <PreferencesProvider repository={repository}>
      <SettingsContainer {...handlers} buttons={buttons} />
    </PreferencesProvider>,
  );
  return { repository, ...handlers };
}

describe('SettingsContainer', () => {
  it('saves the video quality, keeping the other video settings', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByText('Alta 1080p'));
    await waitFor(async () =>
      expect((await repository.load()).videoRecording).toEqual({ quality: 'high', audio: true, showStopwatch: true, startWithTime: false, stopAfterSeconds: 5, doNotDisturb: false }),
    );
  });

  it('saves the vibration, keeping the other button settings', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByText('No'));
    await waitFor(async () => expect((await repository.load()).timingButtons).toEqual({ ...defaultTimingButtons, vibrate: false }));
  });

  it('opens "Cronómetro avanzado" and "Configuración de video"', async () => {
    const { onOpenStopwatch, onOpenVideo } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Cronómetro avanzado' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Configuración de video' }));
    expect(onOpenStopwatch).toHaveBeenCalledTimes(1);
    expect(onOpenVideo).toHaveBeenCalledTimes(1);
  });

  it('shows neither the vibration nor "Cronómetro avanzado" where the phone cannot use the buttons', async () => {
    await setup(unavailableTimingButton);
    expect(screen.queryByText('Vibrar al marcar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cronómetro avanzado' })).toBeNull();
  });

  it('hides the vibration while the buttons are off, as it did beside them', async () => {
    const repository = createInMemoryPreferencesRepository({ ...defaultPreferences, timingButtons: { ...defaultTimingButtons, enabled: false } });
    await setup(undefined, repository);
    expect(await screen.findByRole('button', { name: 'Cronómetro avanzado' })).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Vibrar al marcar')).toBeNull());
  });
});
