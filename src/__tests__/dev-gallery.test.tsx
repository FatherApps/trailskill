import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import Home from '../app/(app)/index';
import DevLayout from '../app/(dev)/_layout';
import GalleryIndex from '../app/(dev)/gallery/index';
import GalleryEntryScreen from '../app/(dev)/gallery/[id]';
import { colors } from '../core/theme';
import { galleryEntries } from '../core/ui';

// Home reads the session and the sync summary, which need the native database.
jest.mock('../core/sync', () => ({
  ...jest.requireActual('../core/sync/syncState'),
  useGlobalSyncSummary: () => ({ pending: 0, failed: 0, uploading: false, lastSyncedAt: null }),
}));
jest.mock('../core/session', () => ({ useSession: () => ({ syncConnectFailed: false }) }));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));

// Lives outside src/app: Expo Router would treat a test file there as a route.
const routes = {
  '(app)/index': Home,
  '(dev)/_layout': DevLayout,
  '(dev)/gallery/index': GalleryIndex,
  '(dev)/gallery/[id]': GalleryEntryScreen,
};

const OPEN_LINK = 'Abrir galería de desarrollo';
const GALLERY_TITLE = 'Galería de desarrollo';
const buttonEntry = galleryEntries.find((entry) => entry.id === 'button')!;
const stateKeys = Object.keys(buttonEntry.states);

const originalDev = (global as { __DEV__?: boolean }).__DEV__;
afterEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = originalDev;
});

async function openButtonEntry() {
  const view = await renderRouter(routes, { initialUrl: '/gallery' });
  await fireEvent.press(screen.getByRole('button', { name: 'Button' }));
  return view;
}

describe('development gallery', () => {
  it('lists the registered entries under their group', async () => {
    await renderRouter(routes, { initialUrl: '/gallery' });

    expect(screen.getByText('core/ui')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Button' })).toBeOnTheScreen();
  });

  it('lists the timing module entries under their own group', async () => {
    await renderRouter(routes, { initialUrl: '/gallery' });

    expect(screen.getByText('timing')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'TimingSetupScreen' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'StopwatchScreen' })).toBeOnTheScreen();
  });

  it('opens a timing entry and shows the state chosen in the selector', async () => {
    await renderRouter(routes, { initialUrl: '/gallery/stopwatch' });
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'stopped' }));

    expect(screen.getByText('MP 34,82')).toBeOnTheScreen();
  });

  it('lists the athletes group with its entries and opens one', async () => {
    const view = await renderRouter(routes, { initialUrl: '/gallery' });

    expect(screen.getByText('athletes')).toBeOnTheScreen();
    for (const title of ['ProfileHeader', 'EventSelector', 'PersonalBest', 'HistoryList', 'ImportPrompt']) {
      expect(screen.getByRole('button', { name: title })).toBeOnTheScreen();
    }

    await fireEvent.press(screen.getByRole('button', { name: 'PersonalBest' }));

    expect(view.getPathname()).toBe('/gallery/personalBest');
    expect(screen.getByRole('radio', { name: 'with-improvement' })).toBeChecked();
  });

  it('lists the school console group with its entries and opens the screen with its states', async () => {
    const view = await renderRouter(routes, { initialUrl: '/gallery' });

    expect(screen.getByText('school-console')).toBeOnTheScreen();
    for (const name of ['Logo', 'ConsoleNav', 'SideSheet', 'AthleteIndicators', 'AthleteFilters', 'AthleteTable', 'AthleteDetail']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }

    await fireEvent.press(screen.getByRole('button', { name: 'AthletesScreen' }));

    expect(view.getPathname()).toBe('/gallery/athletesScreen');
    for (const state of ['with-data', 'loading', 'empty', 'error', 'offline-with-data', 'offline-no-data', 'denied', 'expanded-1280', 'medium-800', 'compact-360']) {
      expect(screen.getByRole('radio', { name: state })).toBeOnTheScreen();
    }
    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
  });

  it('lists the accounts screens under their own group and opens one with its states', async () => {
    const view = await renderRouter(routes, { initialUrl: '/gallery' });

    expect(screen.getByText('accounts')).toBeOnTheScreen();
    for (const name of ['WhoSwimsScreen', 'AccountDetailsScreen', 'SignInScreen']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }

    await fireEvent.press(screen.getByRole('button', { name: 'SignInScreen' }));

    expect(view.getPathname()).toBe('/gallery/signIn');
    for (const state of ['initial', 'codeSent', 'codeMismatch', 'sending', 'offline']) {
      expect(screen.getByRole('radio', { name: state })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeOnTheScreen();
  });

  it('opens an entry with a radio per state and the first one checked', async () => {
    const view = await openButtonEntry();

    expect(view.getPathname()).toBe('/gallery/button');
    for (const key of stateKeys) expect(screen.getByRole('radio', { name: key })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: stateKeys[0] })).toBeChecked();
  });

  it('shows the state chosen in the selector', async () => {
    await openButtonEntry();
    await fireEvent.press(screen.getByRole('radio', { name: 'loading' }));

    expect(screen.getByRole('radio', { name: 'loading' })).toBeChecked();
    expect(screen.getByRole('radio', { name: stateKeys[0] })).not.toBeChecked();
    expect(screen.getByText('Guardando')).toBeOnTheScreen();
  });

  it('switches the preview between light and dark', async () => {
    await openButtonEntry();
    const background = () => StyleSheet.flatten(screen.getByTestId('gallery-preview').props.style).backgroundColor;

    await fireEvent.press(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(background()).toBe(colors.dark['surface-1']);

    await fireEvent.press(screen.getByRole('radio', { name: 'Claro' }));
    expect(background()).toBe(colors.light['surface-1']);
  });

  it('doubles the text size of the preview', async () => {
    await openButtonEntry();
    const fontSize = () => StyleSheet.flatten(screen.getByText('Guardar tiempo').props.style).fontSize;

    await fireEvent.press(screen.getByRole('radio', { name: '200 %' }));
    expect(fontSize()).toBe(32);

    await fireEvent.press(screen.getByRole('radio', { name: '100 %' }));
    expect(fontSize()).toBe(16);
  });

  it('keeps the screen chrome in the app theme and at normal size while the preview changes', async () => {
    await openButtonEntry();
    const chromeBackground = () => StyleSheet.flatten(screen.getByTestId('gallery-screen').props.style).backgroundColor;
    const labelFontSize = () => StyleSheet.flatten(screen.getByText('Estado').props.style).fontSize;

    await fireEvent.press(screen.getByRole('radio', { name: 'Oscuro' }));
    await fireEvent.press(screen.getByRole('radio', { name: '200 %' }));

    expect(chromeBackground()).toBe(colors.light['surface-0']);
    expect(labelFontSize()).toBe(14);
  });

  it('shows the new entry with its first state when the id changes in place', async () => {
    await openButtonEntry();
    await fireEvent.press(screen.getByRole('radio', { name: 'loading' }));

    await act(() => router.setParams({ id: 'tag' }));

    expect(screen.getByRole('header', { name: 'Tag' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'neutral' })).toBeChecked();
    expect(screen.getByLabelText('Infantil B')).toBeOnTheScreen();
  });

  it('mounts each state fresh, so a preview that holds its own state does not keep the previous one', async () => {
    await renderRouter(routes, { initialUrl: '/gallery/segmented' });
    await fireEvent.press(screen.getByRole('radio', { name: 'Espalda' }));

    await fireEvent.press(screen.getByRole('radio', { name: 'distances' }));

    expect(screen.getByRole('radio', { name: '25 m' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '50 m' })).not.toBeChecked();
  });

  it('goes home from the gallery when there is no history to go back to', async () => {
    const view = await renderRouter(routes, { initialUrl: '/gallery' });

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(view.getPathname()).toBe('/');
  });

  it('says so when the entry does not exist', async () => {
    await renderRouter(routes, { initialUrl: '/gallery/nope' });

    expect(screen.getByText('No hay una entrada con ese nombre')).toBeOnTheScreen();
  });

  it('links to the gallery from the home screen in development', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    await renderRouter(routes, { initialUrl: '/' });

    expect(screen.getByText(OPEN_LINK)).toBeOnTheScreen();
  });

  it('is unreachable outside development', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    const view = await renderRouter(routes, { initialUrl: '/gallery' });

    expect(view.getPathname()).toBe('/');
    expect(screen.queryByText(GALLERY_TITLE)).toBeNull();
    expect(screen.queryByText(OPEN_LINK)).toBeNull();
  });
});
