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

  // SectionFrame reads `schoolConsole.<section>.connecting_empty`; a missing key would show the raw key on screen.
  it.each(['coaches', 'records', 'measurements', 'authorizations'])('has the first-sync text of the %s section', (section) => {
    const key = `schoolConsole.${section}.connecting_empty`;

    expect(t(key)).not.toBe(key);
    expect(t(key)).toMatch(/^Todavía no hay .+ en este dispositivo\. Aparecerán cuando termine la primera sincronización\.$/);
  });

  it('has the first-sync text of the athletes screen', () => {
    expect(t('schoolConsole.screen.connecting.message')).toBe(
      'Todavía no hay deportistas guardados en este dispositivo. Aparecerán cuando termine la primera sincronización.',
    );
  });

  it('keeps the shared vocabulary', () => {
    expect(t('common.back')).toBe('Volver');
    expect(t('sport.stroke.FR')).toBe('Libre');
  });
});
