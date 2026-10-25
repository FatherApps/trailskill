import { t } from '../../../core/i18n';
import '..';

describe('school console i18n', () => {
  it('makes the module keys available once the module is loaded', () => {
    expect(t('schoolConsole.nav.athletes')).toBe('Deportistas');
    expect(t('schoolConsole.layout.close')).toBe('Cerrar');
  });

  it('keeps the shared vocabulary', () => {
    expect(t('common.back')).toBe('Volver');
    expect(t('sport.stroke.FR')).toBe('Libre');
  });
});
