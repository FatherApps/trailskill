import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { createInMemoryPreferencesRepository, PreferencesProvider } from '../../../core/preferences';
import { createFakeDoNotDisturb, type DoNotDisturbPort } from '../../family-timing';
import { VideoSettingsContainer } from '../screens/VideoSettingsContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));

async function setup(dnd: DoNotDisturbPort = createFakeDoNotDisturb()) {
  const repository = createInMemoryPreferencesRepository();
  const onBack = jest.fn();
  await render(
    <PreferencesProvider repository={repository}>
      <VideoSettingsContainer onBack={onBack} dnd={dnd} />
    </PreferencesProvider>,
  );
  return { repository, onBack };
}

describe('VideoSettingsContainer', () => {
  it('saves each change, keeping the other video settings', async () => {
    const { repository } = await setup();
    await fireEvent.press(within(screen.getByLabelText('Parar el video después de detener el reloj')).getByText('10 s'));
    await waitFor(async () => expect((await repository.load()).videoRecording.stopAfterSeconds).toBe(10));
    await fireEvent.press(screen.getByRole('switch', { name: 'Grabar con audio' }));
    await waitFor(async () =>
      expect((await repository.load()).videoRecording).toEqual({ quality: 'medium', audio: false, showStopwatch: true, startWithTime: false, stopAfterSeconds: 10, doNotDisturb: false }),
    );
  });

  it('saves the quality, keeping the other video settings', async () => {
    const { repository } = await setup();
    await fireEvent.press(within(screen.getByLabelText('Calidad del video')).getByText('Alta 1080p'));
    await waitFor(async () =>
      expect((await repository.load()).videoRecording).toEqual({ quality: 'high', audio: true, showStopwatch: true, startWithTime: false, stopAfterSeconds: 5, doNotDisturb: false }),
    );
  });
});

// Issue #1090.
describe('VideoSettingsContainer No molestar while recording', () => {
  const option = () => screen.getByRole('switch', { name: 'Activar No molestar mientras grabo' });

  it('is off by default and saves Sí without asking when the access is there', async () => {
    const dnd = createFakeDoNotDisturb(true);
    const { repository } = await setup(dnd);
    expect(option().props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(option());
    await waitFor(async () => expect((await repository.load()).videoRecording.doNotDisturb).toBe(true));
    expect(dnd.opened).toBe(0);
    expect(screen.queryByText('Abrir ajustes de Android')).toBeNull();
  });

  it('is not offered where the phone cannot change it', async () => {
    await setup({ ...createFakeDoNotDisturb(), available: false });
    expect(screen.queryByText('Activar No molestar mientras grabo')).toBeNull();
  });

  // Last: restoring the AppState spy also clears the jest-setup mock's implementation.
  it('takes the person to Android when the access is missing, explains it, and reads it again on return', async () => {
    let onChange: ((state: AppStateStatus) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      onChange = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const dnd = createFakeDoNotDisturb(false);
    await setup(dnd);
    await fireEvent.press(option());
    expect(dnd.opened).toBe(1);
    expect(await screen.findByText(/^Para activarlo, Android pide/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Abrir ajustes de Android'));
    expect(dnd.opened).toBe(2);

    dnd.access = true;
    await act(async () => onChange?.('active'));
    expect(screen.queryByText('Abrir ajustes de Android')).toBeNull();
    spy.mockRestore();
  });
});
