import { t } from '../../../core/i18n';
import '..';

describe('athletes i18n', () => {
  it('makes the module keys available once the module is loaded', () => {
    expect(t('athletes.profile.authorization_valid')).toBe('Autorización vigente');
    expect(t('athletes.personal_best.title')).toBe('Marca personal');
    expect(t('athletes.event_selector.pool')).toBe('Piscina');
  });

  it('keeps the shared sport vocabulary', () => {
    expect(t('sport.stroke.FR')).toBe('Libre');
  });

  it('pluralizes the improvement text', () => {
    expect(t('athletes.personal_best.improvement', { time: '0,50', count: 1 })).toBe('−0,50 en 1 mes');
    expect(t('athletes.personal_best.improvement', { time: '2,28', count: 6 })).toBe('−2,28 en 6 meses');
  });

  it('keeps the minutes count for any value', () => {
    expect(t('athletes.profile.updated', { count: 1 })).toBe('Actualizado hace 1 min');
    expect(t('athletes.profile.updated', { count: 5 })).toBe('Actualizado hace 5 min');
  });
});
