import { createProviderRegistry, type OrganizationData } from '../registry.ts';
import { createFakeProvider } from './fakeProvider.ts';

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
