import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { SettingsContainer } from '../screens/SettingsContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));

async function setup(repository = createInMemoryPreferencesRepository()) {
  const handlers = { onBack: jest.fn(), onOpenStopwatch: jest.fn(), onOpenVideo: jest.fn() };
  await render(
    <PreferencesProvider repository={repository}>
      <SettingsContainer {...handlers} />
    </PreferencesProvider>,
  );
  return { repository, ...handlers };
}

describe('SettingsContainer', () => {
  it('saves the theme, keeping the other preferences', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByText('Sol'));
    await waitFor(async () => expect(await repository.load()).toEqual({ ...defaultPreferences, themeMode: 'sun' }));
  });

  it('shows only the theme and the entries', async () => {
    await setup();
    expect(await screen.findByRole('button', { name: 'Cronómetro avanzado' })).toBeOnTheScreen();
    expect(screen.queryByText('Precisión de los tiempos')).toBeNull();
    expect(screen.queryByText('Vibrar al marcar')).toBeNull();
    expect(screen.queryByText('Calidad del video')).toBeNull();
  });

  it('opens "Cronómetro avanzado" and "Configuración de video"', async () => {
    const { onOpenStopwatch, onOpenVideo } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Cronómetro avanzado' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Configuración de video' }));
    expect(onOpenStopwatch).toHaveBeenCalledTimes(1);
    expect(onOpenVideo).toHaveBeenCalledTimes(1);
  });
});
