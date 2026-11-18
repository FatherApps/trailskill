import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';

import { createInMemoryAppVersionsCache, createInMemoryAppVersionsRepository } from '../data/appVersions';
import { VersionGate } from '../screens/VersionGate';

jest.mock('../../../core/sync', () => ({ supabase: {} }));

const versions = { minVersion: '0.2.0', latestVersion: '0.4.0' };

async function setup(options: { native: string; remote?: typeof versions | null; failing?: boolean; cached?: typeof versions | null }) {
  const repository = createInMemoryAppVersionsRepository({ versions: options.remote ?? null, failing: options.failing });
  const cache = createInMemoryAppVersionsCache(options.cached ?? null);
  await render(
    <VersionGate repository={repository} cache={cache} nativeVersion={options.native} platform="android" playUrl="https://play.example.test/app">
      <Text>app</Text>
    </VersionGate>,
  );
  return { repository, cache };
}

const blockingTitle = () => screen.queryByText('Actualiza Swimcro');
const bannerText = () => screen.queryByText('Hay una versión nueva de Swimcro.');

describe('VersionGate', () => {
  it('blocks a version below the minimum with the Play link and no app behind it', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await setup({ native: '0.1.0', remote: versions });

    expect(await screen.findByText('Actualiza Swimcro')).toBeOnTheScreen();
    expect(screen.queryByText('app')).toBeNull();
    await fireEvent.press(screen.getByText('Actualizar en Play'));
    expect(openURL).toHaveBeenCalledWith('https://play.example.test/app');
    openURL.mockRestore();
  });

  it('shows a dismissible notice above the app below the latest version', async () => {
    await setup({ native: '0.3.0', remote: versions });

    expect(await screen.findByText('Hay una versión nueva de Swimcro.')).toBeOnTheScreen();
    expect(screen.getByText('app')).toBeOnTheScreen();
    expect(blockingTitle()).toBeNull();

    await fireEvent.press(screen.getByLabelText('Cerrar aviso'));

    expect(bannerText()).toBeNull();
    expect(screen.getByText('app')).toBeOnTheScreen();
  });

  it('shows only the app at the latest version', async () => {
    const { repository } = await setup({ native: '0.4.0', remote: versions });
    await act(async () => {});

    expect(repository.calls).toBe(1);
    expect(screen.getByText('app')).toBeOnTheScreen();
    expect(bannerText()).toBeNull();
    expect(blockingTitle()).toBeNull();
  });

  it('opens on a first launch without signal and without a saved value', async () => {
    const { repository } = await setup({ native: '0.1.0', failing: true });
    await act(async () => {});

    expect(repository.calls).toBe(1);
    expect(screen.getByText('app')).toBeOnTheScreen();
    expect(bannerText()).toBeNull();
    expect(blockingTitle()).toBeNull();
  });

  it('never blocks without signal: a saved minimum above this version is only a notice', async () => {
    await setup({ native: '0.1.0', failing: true, cached: versions });

    expect(await screen.findByText('Hay una versión nueva de Swimcro.')).toBeOnTheScreen();
    expect(screen.getByText('app')).toBeOnTheScreen();
    expect(blockingTitle()).toBeNull();
  });

  it('saves what the server answered', async () => {
    const { cache } = await setup({ native: '0.4.0', remote: versions });
    await act(async () => {});

    await expect(cache.load()).resolves.toEqual(versions);
  });

  describe('when the signal comes back', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('retries every minute and blocks as soon as the server answers', async () => {
      const { repository } = await setup({ native: '0.1.0', failing: true, cached: versions });
      await act(async () => {});
      expect(blockingTitle()).toBeNull();

      repository.failing = false;
      repository.versions = versions;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });

      expect(screen.getByText('Actualiza Swimcro')).toBeOnTheScreen();
      expect(screen.queryByText('app')).toBeNull();
    });
  });
});
