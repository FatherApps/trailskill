import esCO from './es-CO.json';

// shortcut: no i18next yet, Task 2 replaces the internals and keeps t() and the JSON keys
export function t(key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], esCO);
  // A missing translation stays visible as its key instead of rendering nothing.
  return typeof value === 'string' ? value : key;
}
