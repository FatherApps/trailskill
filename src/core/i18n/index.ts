import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import esCO from './es-CO.json';

const i18n = createInstance();

// UI language is an open product decision: es-CO only until it is confirmed.
i18n.use(initReactI18next).init({
  lng: 'es-CO',
  fallbackLng: 'es-CO',
  resources: { 'es-CO': { translation: esCO } },
  interpolation: { escapeValue: false },
  // Synchronous init: the bundled resources are available on first render.
  initAsync: false,
});

export { i18n };

// A missing translation stays visible as its key (i18next returns the key).
// `values` fills {{placeholders}} in the translation, for example {{step}}.
export function t(key: string, values?: Record<string, string | number>): string {
  return i18n.t(key, values);
}
