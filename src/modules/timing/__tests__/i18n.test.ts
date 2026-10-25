import { t } from '../../../core/i18n';
import { registerTimingI18n } from '../i18n';

describe('timing i18n', () => {
  it('resolves the module copy through the core t()', () => {
    expect(t('timing.setup.title')).toBe('Toma de tiempos');
    expect(t('timing.stopwatch.personal_best', { time: '34,82' })).toBe('MP 34,82');
    expect(t('timing.stopwatch.title', { name: 'Mateo C.', current: 1, total: 4 })).toBe('Mateo C. · 1 de 4');
  });

  it('keeps registration harmless when it runs twice and leaves core copy untouched', () => {
    registerTimingI18n();
    registerTimingI18n();

    expect(t('timing.stopwatch.start')).toBe('Iniciar');
    expect(t('common.back')).toBe('Volver');
    expect(t('sport.stroke.FR')).toBe('Libre');
  });

  it('registers when a module component is imported, without calling the function', () => {
    jest.isolateModules(() => {
      const core = jest.requireActual<typeof import('../../../core/i18n')>('../../../core/i18n');
      expect(core.t('timing.setup.title')).toBe('timing.setup.title');

      jest.requireActual('../components/TimingHeader');

      expect(core.t('timing.setup.title')).toBe('Toma de tiempos');
    });
  });
});
