import { unavailable } from './shared.ts';

/** The most pages of a results PDF the server reads. The real ones have about 25; more is a file this does not know. */
export const MAX_PAGES = 60;
/** The most text, in bytes, the server keeps of a PDF. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
/** The cells of a line are joined with this, because a cell (a name, a club) has spaces of its own. */
export const CELL_SEPARATOR = '\t';
// Items within this many points of the first item of a line are one line. The event number sits 3 points off the baseline of its title and
// the lines are 11 or more points apart.
const SAME_LINE = 4;

/** One piece of text of a page and where it is: `x` grows to the right, `y` grows up. */
export type PdfItem = { text: string; x: number; y: number };
/** A PDF as this module reads it: its page count and the items of each page (0-based). The one implementation that opens a real file is `unpdf.ts`. */
export type PdfDocument = { pages: number; page(index: number): Promise<PdfItem[]> };
export type OpenPdf = (bytes: Uint8Array) => Promise<PdfDocument>;

const NOT_READABLE = 'The tournament file is not a PDF this reader knows';

/**
 * The text of a PDF as lines, top to bottom, page after page; each line is its cells (left to right) joined with `CELL_SEPARATOR`.
 * Refuses (typed "unavailable", no cause) a file that does not open, one with more than `MAX_PAGES` pages and one with more than
 * `MAX_TEXT_BYTES` of text, the page count being checked before any page is read.
 */
export async function readPdfLines(open: OpenPdf, bytes: Uint8Array): Promise<string[]> {
  let document: PdfDocument;
  try {
    document = await open(bytes);
  } catch {
    return unavailable(NOT_READABLE);
  }
  if (!Number.isInteger(document.pages) || document.pages < 1 || document.pages > MAX_PAGES) return unavailable('The tournament file has too many pages');

  const encoder = new TextEncoder();
  const lines: string[] = [];
  let size = 0;
  for (let index = 0; index < document.pages; index += 1) {
    let items: PdfItem[];
    try {
      items = await document.page(index);
    } catch {
      return unavailable(NOT_READABLE);
    }
    const sorted = items
      .map((item) => ({ ...item, text: item.text.replace(/\s+/g, ' ').trim() }))
      .filter((item) => item.text !== '')
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; cells: { text: string; x: number }[] }[] = [];
    for (const { text, x, y } of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - y) <= SAME_LINE) last.cells.push({ text, x });
      else rows.push({ y, cells: [{ text, x }] });
    }
    for (const row of rows) {
      const line = row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(CELL_SEPARATOR);
      size += encoder.encode(line).length;
      if (size > MAX_TEXT_BYTES) return unavailable('The tournament file has too much text');
      lines.push(line);
    }
  }
  return lines;
}
