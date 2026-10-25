import { i18n, t } from '../../../core/i18n';
import '..';
import esCO from '../i18n/es-CO.json';

// The module barrel exports the PowerSync repository, which pulls in the ESM-only PowerSync package.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

describe('training-plans i18n', () => {
  it('makes the module keys available once the module is loaded', () => {
    expect(t('training_plans.phase.warm_up')).toBe('Calentamiento');
    expect(t('training_plans.block.summary', { repetitions: 4, distance: 100, activity: 'Libre' })).toBe(
      '4 × 100 m Libre',
    );
    expect(t('training_plans.today.status.partial', { done: 3, total: 4 })).toBe('Parcial · 3 de 4');
  });

  it('pluralizes the block count', () => {
    expect(t('training_plans.builder.count', { count: 1 })).toBe('1 bloque');
    expect(t('training_plans.builder.count', { count: 5 })).toBe('5 bloques');
  });

  it('keeps registration harmless when the module loads twice and leaves core copy untouched', () => {
    i18n.addResourceBundle('es-CO', 'translation', { training_plans: esCO }, true, true);
    i18n.addResourceBundle('es-CO', 'translation', { training_plans: esCO }, true, true);

    expect(t('training_plans.builder.add')).toBe('Agregar bloque');
    expect(t('common.back')).toBe('Volver');
  });
});
