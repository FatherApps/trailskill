import { i18n } from '../../../core/i18n';
import esCO from './es-CO.json';

// Merges the module copy into the core instance (deep, overwriting): running it again changes nothing.
export function registerTimingI18n(): void {
  i18n.addResourceBundle('es-CO', 'translation', esCO, true, true);
}

// Components import this file, so the copy exists as soon as the module is used.
registerTimingI18n();
