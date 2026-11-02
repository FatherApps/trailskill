// Every value here is invented. The shape follows the maintainer's description of the page (issues #80 and #827):
// the POST answer holds the profile card and 17 empty event tables, and the rows come from one JSON GET per event number.

/** The event numbers the page serves, from the `prueba` selector (issue #80, comment 6581210025, question 3). */
export const PRUEBAS = [2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22];

// Sentinels for what must never be copied: if one shows up in an output, the adapter leaked a field.
export const GENDER = 'GENDER-SENTINEL';
export const BIRTH_DATE = '1901-02-03';
export const AGE = 777;
export const CATEGORY = 'CATEGORY-SENTINEL';
export const IDENTITY = 'IDENTITY-SENTINEL';

/** One row of `getHistorial`: keys 0-6 copy the named keys, as the page does. */
export function historyRow(overrides: Record<string, unknown> = {}, prueba: number | string = 2): Record<string, unknown> {
  const named = {
    categoria: CATEGORY,
    tiempo: '00:00:28.45',
    diferencia: '<span class="text-success">-0.12</span>',
    puntos: 310,
    fecha_torneo: '2026-03-14',
    piscina: 'LC',
    torneo: 'Synthetic Open',
  };
  const copies = Object.fromEntries(Object.values(named).map((value, index) => [String(index), value]));
  return { ...copies, ...named, prueba_id: prueba, segundos: 28.45, genero: GENDER, fecha_nac: BIRTH_DATE, edad: AGE, ...overrides };
}

export const PROFILE_LABELS: [string, string][] = [
  ['Identificación', IDENTITY],
  ['Genero', GENDER],
  ['Fecha de Nacimiento', BIRTH_DATE],
  ['Club', 'Club Sintético'],
  ['Liga', 'Liga Sintética'],
];

/** The profile card: `ul.nav > a.nav-link` with the label as text and the value in `span.badge`. */
export const profileCard = (entries: [string, string][] = PROFILE_LABELS) =>
  `<ul class="nav nav-pills flex-column">${entries
    .map(([label, value]) => `<a class="nav-link" href="#">${label} <span class="badge badge-primary float-right">${value}</span></a>`)
    .join('')}</ul>`;

const EVENT_TABLES = ['50l', '100l', '200l', '400l', '800l', '1500l', '50e', '100e', '200e', '50p', '100p', '200p', '50m', '100m', '200m', '200c', '400c'];
/** The 17 tables the page answers with: always empty, the rows live in `getHistorial`. */
export const emptyTables = () => EVENT_TABLES.map((id) => `<table id="${id}" class="table display"><thead><tr><th>Tiempo</th></tr></thead></table>`).join('');

export const option = (value: string, lastNames: string, firstNames: string) =>
  `<option value="${value}">${lastNames}\n\t\t\t\t\t\t${firstNames}</option>`;

export const rosterPage = (options: string[], selectAttributes = 'id="nadador" name="nadador"') =>
  `<html><form action="historialFilter" method="post"><select ${selectAttributes} required>${options.join('\n')}</select></form></html>`;

export const historyPage = (profile = profileCard(), heading = '<h3>SOMEONE ELSE ENTIRELY</h3>') =>
  `<html>${rosterPage([])}${heading}${profile}${emptyTables()}</html>`;
