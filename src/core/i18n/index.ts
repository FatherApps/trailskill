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

// The one place that trims an athlete's name: a blank one is "", whoever shows it.
export const trimName = (name: string) => name.trim();

// The one place that picks between a text with the athlete's name and its `<key>_no_name` sibling for a blank name,
// so a text that shows the name cannot leave a gap in the sentence. `values` fills the other placeholders.
// Every key a call uses needs its `_no_name` sibling: `namedText.test.ts` walks the calls and fails when one is missing.
export function namedText(key: string, name: string, values: Record<string, string | number> = {}): string {
  const trimmed = trimName(name);
  return trimmed ? t(key, { ...values, name: trimmed }) : t(`${key}_no_name`, values);
}
