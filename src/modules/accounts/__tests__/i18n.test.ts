import { t } from '../../../core/i18n';
import '../index';
import esCO from '../i18n/es-CO.json';

describe('accounts i18n', () => {
  it('registers its copy when the module is imported', () => {
    expect(t('accounts.create_title')).toBe('Crear cuenta');
  });

  it('resolves every key under accounts to a non-empty string', () => {
    const leaves = (node: unknown, path: string): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([key, value]) => leaves(value, `${path}.${key}`))
        : [path];
    const keys = leaves(esCO.accounts, 'accounts');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(t(key)).not.toBe('');
      expect(t(key)).not.toBe(key);
    }
  });
});
