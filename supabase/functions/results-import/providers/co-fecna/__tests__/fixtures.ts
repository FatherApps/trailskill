// Every value here is invented. The shape follows the maintainer's description of the page (issue #80, comment 6581210025).
// ASSUMED, pending real rows (questions 8 to 10): the cell formats of time, date and pool, how a missing time looks,
// and the club and league of a swimmer.

export const HEADERS = ['Categoría', 'Tiempo', 'Diferencia en S', 'Puntos World Aquatics', 'Fecha', 'Piscina', 'Torneo'];

export type Row = { time?: string; date?: string; pool?: string; competition?: string; category?: string };

const cells = (row: Row) =>
  [row.category ?? 'Cat 1', row.time ?? '28.45', '0.00', '310', row.date ?? '2026-03-14', row.pool ?? '50m', row.competition ?? 'Synthetic Open']
    .map((value) => `<td>${value}</td>`)
    .join('');

/** One table per event, as on the page: no tbody, columns in the documented order. */
export function table(id: string, rows: Row[] = [], headers: string[] = HEADERS): string {
  const head = `<thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>`;
  return `<h3 class="card-title">title</h3><table id="${id}" class="table display dt-responsive nowrap">${head}${rows
    .map((row) => `<tr>${cells(row)}</tr>`)
    .join('')}</table>`;
}

export const option = (value: string, lastNames: string, firstNames: string) =>
  `<option value="${value}">${lastNames}\n\t\t\t\t\t\t${firstNames}</option>`;

export const rosterPage = (options: string[], selectAttributes = 'id="nadador" name="nadador"') =>
  `<html><form action="historialFilter" method="post"><select ${selectAttributes} required>${options.join('\n')}</select></form></html>`;

export const historyPage = (tables: string[], heading = '<h3>SOMEONE ELSE ENTIRELY</h3>') => `<html>${rosterPage([])}${heading}${tables.join('')}</html>`;
