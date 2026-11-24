import type { OpenPdf, PdfItem } from '../pdfLines.ts';

// Synthetic text in the layout of a results PDF as `readPdfLines` gives it (cells joined with a tab). Every name, club, league and date is invented.
export const T = '\t';
export const cells = (...parts: (string | number | null | undefined)[]) => parts.filter((part) => part !== null && part !== undefined && part !== '').join(T);

export const COLUMNS = cells('Place', 'Birth', 'Ht', 'Ln', 'Team', 'A.A.Points', 'Name', 'Prelim', 'Time', 'Obsv.');

/** The three lines each page repeats: the organizer, the tournament with its year, and the days. */
export const pageHeader = (name = 'Copa Sintetica Ejemplo 2026 - Ciudad Ficticia', days = '20 - 21 de noviembre de 2026') => ['LIGA SINTETICA DE EJEMPLO', name, days];

export const event = (n: number, title: string, sex: 'Men' | 'Women') => cells(n, title, sex);
export const FREE_50 = '50m Libre/50m Free';

export const ageGroup = (label: string, sex: 'm' | 'f' = 'f') => `Age Group: ${label} | ${sex}`;

type RowInput = {
  place?: number | null;
  birth: string;
  ht?: number | null;
  ln?: number | null;
  team?: string;
  points?: number | null;
  name: string;
  prelim?: string;
  time: string;
  obsv?: string | null;
};
export const row = ({ place = null, birth, ht = 1, ln = 1, team = 'ZZA/Club Sintetico', points = null, name, prelim = 'NT', time, obsv = null }: RowInput) =>
  cells(place, birth, ht, ln, team, points, name, prelim, time, obsv);

/** A results PDF of one tournament, as text: the cover page, then the header, then `body` (events, age groups and rows). */
export const document = (body: string[], header = pageHeader()) => [
  'RESULTADOS',
  ...header,
  'Ciudad Ficticia',
  cells('Page 1/2', 'Documento sintetico de ejemplo', 'contacto@example.test'),
  ...header,
  ...body,
];

/** A fake PDF: the bytes carry the pages, as JSON of items, and the opener reads them back. It is the only "PDF" the tests have. */
export const pdfBytes = (pages: string[][]): Uint8Array => new TextEncoder().encode(JSON.stringify(pages.map((lines) => lines.map((line, index) => ({ text: line.split(T), y: 800 - index * 12 })))));

export const fakeOpen: OpenPdf = async (bytes) => {
  const pages = JSON.parse(new TextDecoder().decode(bytes)) as { text: string[]; y: number }[][];
  return {
    pages: pages.length,
    async page(index): Promise<PdfItem[]> {
      return pages[index].flatMap(({ text, y }) => text.map((part, at) => ({ text: part, x: 30 + at * 60, y })));
    },
  };
};
