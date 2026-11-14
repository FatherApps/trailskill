import { createProviderRegistry, type OrganizationData } from '../registry.ts';
import { createFakePlatform, createFakeProvider, TOURNAMENT_URL } from './fakeProvider.ts';

const org = (id: string, overrides: Partial<OrganizationData> = {}): OrganizationData => ({
  id,
  type: 'federation',
  countryCode: 'ZZ',
  parentId: null,
  provider: null,
  ...overrides,
});

const fake = createFakeProvider();
const registry = createProviderRegistry([fake]);

const tree = [
  org('fed', { provider: 'zz-test' }),
  org('league', { type: 'league', parentId: 'fed' }),
  org('school', { type: 'school', parentId: 'league' }),
];

describe('provider registry', () => {
  it('picks the adapter from the federation, walking up school to league to federation', () => {
    expect(registry.resolve(tree, 'school')).toBe(fake);
    expect(registry.resolve(tree, 'league')).toBe(fake);
    expect(registry.resolve(tree, 'fed')).toBe(fake);
  });

  it('returns null when no organization in the chain has a provider', () => {
    expect(registry.resolve([org('fed')], 'fed')).toBeNull();
  });

  it('returns null when the provider is not registered', () => {
    expect(registry.resolve([org('fed', { provider: 'zz-other' })], 'fed')).toBeNull();
  });

  it('returns null for an unknown start id', () => {
    expect(registry.resolve(tree, 'missing')).toBeNull();
  });

  it('returns null when the chain is broken by a missing parent', () => {
    expect(registry.resolve([org('school', { type: 'school', parentId: 'gone' })], 'school')).toBeNull();
  });

  it('ignores a provider on a non-federation', () => {
    const data = [org('league', { type: 'league', provider: 'zz-test' })];
    expect(registry.resolve(data, 'league')).toBeNull();
  });

  it('ignores a provider whose country prefix differs from the organization country', () => {
    const other = createProviderRegistry([createFakeProvider({ key: 'yy-test' })]);
    expect(other.resolve([org('fed', { provider: 'yy-test' })], 'fed')).toBeNull();
  });

  it('ignores a federation without a country code', () => {
    expect(registry.resolve([org('fed', { countryCode: null, provider: 'zz-test' })], 'fed')).toBeNull();
  });

  it('matches the country code case-insensitively', () => {
    expect(registry.resolve([org('fed', { countryCode: 'zz', provider: 'zz-test' })], 'fed')).toBe(fake);
  });

  it('keeps walking past an ignored provider to a valid ancestor', () => {
    const data = [
      org('fed', { provider: 'zz-test' }),
      org('league', { type: 'league', parentId: 'fed', provider: 'zz-test' }),
    ];
    expect(registry.resolve(data, 'league')).toBe(fake);
  });

  it('stops on a cycle', () => {
    const data = [
      org('a', { type: 'league', parentId: 'b' }),
      org('b', { type: 'league', parentId: 'a' }),
    ];
    expect(registry.resolve(data, 'a')).toBeNull();
  });

  it.each(['test', 'ZZ-test', 'zz_test', 'zz-', 'zzz-test', 'zz-Test', 'zz--test', ''])('rejects the invalid key %p', (key) => {
    expect(() => createProviderRegistry([createFakeProvider({ key })])).toThrow(`Invalid provider key: ${key}`);
  });

  it('accepts keys with several segments', () => {
    expect(() => createProviderRegistry([createFakeProvider({ key: 'zz-some-body2' })])).not.toThrow();
  });

  it('rejects duplicate keys', () => {
    expect(() => createProviderRegistry([createFakeProvider(), createFakeProvider()])).toThrow('Duplicate provider key: zz-test');
  });
});

describe('platform adapters', () => {
  const platform = createFakePlatform();
  const withPlatform = createProviderRegistry([fake], [platform]);
  const games = (id = 'games', overrides: Partial<OrganizationData> = {}) => org(id, { type: 'results_platform', provider: 'zz-games', ...overrides });

  it('resolves a pasted address to the platform adapter and to the one organization that holds its provider', () => {
    const data = [org('fed', { provider: 'zz-test' }), games()];
    expect(withPlatform.resolveUrl(data, TOURNAMENT_URL)).toEqual({ provider: platform, organizationId: 'games' });
  });

  it('does not resolve an address no platform adapter accepts', () => {
    expect(withPlatform.resolveUrl([games()], 'https://other.example.test/tournament/1')).toBeNull();
    expect(createProviderRegistry([fake]).resolveUrl([games()], TOURNAMENT_URL)).toBeNull();
  });

  it('does not resolve an address that two platform adapters accept', () => {
    const twin = createFakePlatform({ key: 'zz-twin' });
    const both = createProviderRegistry([fake], [platform, twin]);
    expect(both.resolveUrl([games(), games('twin', { provider: 'zz-twin' })], TOURNAMENT_URL)).toBeNull();
  });

  it.each([
    ['no organization holds the provider', [org('fed', { provider: 'zz-test' })]],
    ['two organizations hold the provider', [games(), games('games-2')]],
    ['the organization is a federation, not a platform', [org('fed', { provider: 'zz-games' })]],
    ['the organization has no country', [games('games', { countryCode: null })]],
    ['the provider prefix is not the organization country', [games('games', { countryCode: 'YY' })]],
  ])('does not resolve an address when %s', (_name, data) => {
    expect(withPlatform.resolveUrl(data, TOURNAMENT_URL)).toBeNull();
  });

  it('matches the country code case-insensitively', () => {
    expect(withPlatform.resolveUrl([games('games', { countryCode: 'zz' })], TOURNAMENT_URL)).toEqual({ provider: platform, organizationId: 'games' });
  });

  it('gives the platform adapter of a platform organization, and nothing for any other', () => {
    const data = [org('fed', { provider: 'zz-test' }), games(), games('unregistered', { provider: 'zz-elsewhere' }), games('abroad', { countryCode: 'YY' })];
    expect(withPlatform.platformFor(data, 'games')).toBe(platform);
    for (const id of ['fed', 'unregistered', 'abroad', 'missing']) expect(withPlatform.platformFor(data, id)).toBeNull();
  });

  it('does not walk up from a platform organization, and resolve never answers a platform', () => {
    const data = [org('fed', { provider: 'zz-test' }), games('games', { parentId: 'fed' })];
    expect(withPlatform.resolve(data, 'games')).toBe(fake);
    expect(withPlatform.platformFor([games('games', { parentId: 'fed' }), org('fed', { provider: 'zz-test' })], 'fed')).toBeNull();
  });

  it('checks the keys of both lists together', () => {
    expect(() => createProviderRegistry([fake], [createFakePlatform({ key: 'Games' })])).toThrow('Invalid provider key: Games');
    expect(() => createProviderRegistry([fake], [createFakePlatform({ key: 'zz-test' })])).toThrow('Duplicate provider key: zz-test');
    expect(() => createProviderRegistry([fake], [platform, createFakePlatform()])).toThrow('Duplicate provider key: zz-games');
  });
});
