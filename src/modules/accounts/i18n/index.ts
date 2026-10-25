import { i18n, t } from '../../../core/i18n';
import esCO from './es-CO.json';

// Registered when the module's code is first imported, so a screen imported on its own already has its copy.
i18n.addResourceBundle('es-CO', 'translation', esCO, true, true);

export { t };
