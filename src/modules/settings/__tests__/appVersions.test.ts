import * as SecureStore from 'expo-secure-store';

import { compareVersions, createSecureStoreAppVersionsCache, versionGate } from '../data/appVersions';

jest.mock('../../../core/sync', () => ({ supabase: {} }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));

const versions = { minVersion: '0.2.0', latestVersion: '0.4.0' };

describe('compareVersions', () => {
  it('compares dotted versions as numbers, part by part', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('treats a missing part as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1')).toBeGreaterThan(0);
  });
});

describe('versionGate', () => {
  it('blocks below the minimum when the answer is fresh', () => {
    expect(versionGate('0.1.9', versions, true)).toBe('blocked');
  });

  it('only warns below the latest but not below the minimum', () => {
    expect(versionGate('0.3.0', versions, true)).toBe('update');
  });

  it('shows nothing at the latest or above it', () => {
    expect(versionGate('0.4.0', versions, true)).toBe('ok');
    expect(versionGate('0.10.0', versions, true)).toBe('ok');
  });

  it('never blocks with a saved value: below the minimum offline is a notice', () => {
    expect(versionGate('0.1.0', versions, false)).toBe('update');
  });

  it('opens with no versions or no native version', () => {
    expect(versionGate('0.1.0', null, true)).toBe('ok');
    expect(versionGate(null, versions, true)).toBe('ok');
  });
});

describe('secure store cache', () => {
  const read = (raw: string | null) => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(raw);
    return createSecureStoreAppVersionsCache().load();
  };

  it('reads what it saved', async () => {
    await createSecureStoreAppVersionsCache().save(versions);
    const [, raw] = jest.mocked(SecureStore.setItemAsync).mock.calls[0];
    await expect(read(raw)).resolves.toEqual(versions);
  });

  it.each([null, 'not json', '{"minVersion":1}', '{"minVersion":"x","latestVersion":"1.0"}', '[]'])('ignores invalid data %p', async (raw) => {
    await expect(read(raw)).resolves.toBeNull();
  });

  it('ignores a read that fails', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    await expect(createSecureStoreAppVersionsCache().load()).resolves.toBeNull();
  });
});
