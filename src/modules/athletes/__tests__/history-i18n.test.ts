import { t } from '../../../core/i18n';
import '..';

// The athletes index reaches the PowerSync repository through the timing index; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

describe('athletes history i18n', () => {
  it.each([
    ['athletes.history.context.training', 'Entrenamiento'],
    ['athletes.history.context.competition', 'Competencia'],
    ['athletes.history.value.series_total', 'Total serie'],
    ['athletes.history.origin.external_timer', 'Botón externo'],
    ['athletes.import_prompt.dismiss', 'Ahora no'],
    ['athletes.date.month_short.10', 'oct'],
  ])('%s is available after loading the module', (key, text) => {
    expect(t(key)).toBe(text);
  });

  it('fills the placeholders', () => {
    expect(t('athletes.import_prompt.refresh', { source: 'FEDNAT' })).toBe('Actualizar desde FEDNAT');
    expect(t('athletes.history.value.repetition', { index: 3 })).toBe('Rep. 3');
  });
});
