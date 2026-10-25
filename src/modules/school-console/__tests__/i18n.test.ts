import { t } from '../../../core/i18n';
import '..';

// The index re-exports the PowerSync repository, which loads the native database module.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

describe('school console i18n', () => {
  it('makes the module keys available once the module is loaded', () => {
    expect(t('schoolConsole.nav.athletes')).toBe('Deportistas');
    expect(t('schoolConsole.layout.close')).toBe('Cerrar');
  });

  it('has the categories vocabulary', () => {
    expect(t('schoolConsole.categories.new_label')).toBe('Nueva categoría');
    expect(t('schoolConsole.categories.move_up', { name: 'Categoría A' })).toBe('Subir Categoría A');
    expect(t('schoolConsole.categories.confirm.title', { name: 'Categoría A' })).toBe('¿Desactivar Categoría A?');
  });

  it('keeps the shared vocabulary', () => {
    expect(t('common.back')).toBe('Volver');
    expect(t('sport.stroke.FR')).toBe('Libre');
  });
});
