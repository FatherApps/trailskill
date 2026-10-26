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
    expect(t('training_plans.builder.remove_message', { position: 2 })).toBe('El bloque 2 sale del plan cuando lo guardes.');
  });

  it('pluralizes the block count', () => {
    expect(t('training_plans.builder.count', { count: 1 })).toBe('1 bloque');
    expect(t('training_plans.builder.count', { count: 5 })).toBe('5 bloques');
  });

  it('writes "Hoy" once: the caption takes the title as a parameter', () => {
    expect(esCO.today.caption).not.toContain('Hoy');
    expect(t('training_plans.today.caption', { title: t('training_plans.today.title'), name: 'Lucía R.' })).toBe(
      'Hoy · Lucía R.',
    );
  });

  it('builds the heading label from one key and a context per optional part, so the title, the separator and the order are translatable', () => {
    const values = { title: t('training_plans.today.title'), plan: 'Resistencia aeróbica', name: 'Lucía R.', summary: '950 m · 5 bloques' };

    expect(esCO.today.heading).not.toContain('Hoy');
    expect(t('training_plans.today.heading', values)).toBe('Hoy · Resistencia aeróbica');
    expect(t('training_plans.today.heading', { ...values, context: 'name' })).toBe('Hoy · Resistencia aeróbica, Lucía R.');
    expect(t('training_plans.today.heading', { ...values, context: 'summary' })).toBe('Hoy · Resistencia aeróbica, 950 m · 5 bloques');
    expect(t('training_plans.today.heading', { ...values, context: 'name_summary' })).toBe('Hoy · Resistencia aeróbica, Lucía R., 950 m · 5 bloques');
  });

  it('has a caption without the athlete, with no separator left hanging', () => {
    expect(t('training_plans.today.caption_no_athlete', { title: t('training_plans.today.title') })).toBe('Hoy');
  });

  it('keeps registration harmless when the module loads twice and leaves core copy untouched', () => {
    i18n.addResourceBundle('es-CO', 'translation', { training_plans: esCO }, true, true);
    i18n.addResourceBundle('es-CO', 'translation', { training_plans: esCO }, true, true);

    expect(t('training_plans.builder.add')).toBe('Agregar bloque');
    expect(t('common.back')).toBe('Volver');
  });
});
