import { ProviderUnavailableError } from '../../../port.ts';
import { MAX_PAGES, MAX_TEXT_BYTES, readPdfLines, type PdfDocument, type PdfItem } from '../pdfLines.ts';

const open = (pages: PdfItem[][], spy?: jest.Mock) => async (): Promise<PdfDocument> => ({
  pages: pages.length,
  async page(index) {
    spy?.(index);
    return pages[index];
  },
});
const item = (text: string, x: number, y: number): PdfItem => ({ text, x, y });

describe('readPdfLines', () => {
  it('joins the cells of a line left to right with a tab, and reads the lines top to bottom, page after page', async () => {
    const lines = await readPdfLines(
      open([
        [item('Women', 235, 677.5), item('50m Libre/50m Free', 58, 677.5), item('Place', 31, 632.3), item('Birth', 60, 632.3)],
        [item('Second page', 31, 700)],
      ]),
      new Uint8Array(1),
    );
    expect(lines).toEqual(['50m Libre/50m Free\tWomen', 'Place\tBirth', 'Second page']);
  });

  it('puts a lone number 3 points off its title baseline on the title\'s line, and keeps lines 11 points apart separate', async () => {
    const lines = await readPdfLines(open([[item('1', 31.2, 674.5), item('50m Libre/50m Free', 58.1, 677.5), item('Women', 235.2, 677.5), item('Age Group: Open 30-34 | f', 31.2, 663.4)]]), new Uint8Array(1));
    expect(lines).toEqual(['1\t50m Libre/50m Free\tWomen', 'Age Group: Open 30-34 | f']);
  });

  it('drops empty items and collapses the spaces inside a cell', async () => {
    const lines = await readPdfLines(open([[item('  ', 10, 100), item('SYNTHETIC   Ana  Maria', 30, 100), item('', 90, 100)]]), new Uint8Array(1));
    expect(lines).toEqual(['SYNTHETIC Ana Maria']);
  });

  it(`reads a file of ${MAX_PAGES} pages`, async () => {
    const pages = Array.from({ length: MAX_PAGES }, (_, index) => [item(`page ${index}`, 10, 100)]);
    expect(await readPdfLines(open(pages), new Uint8Array(1))).toHaveLength(MAX_PAGES);
  });

  it(`refuses a file of more than ${MAX_PAGES} pages without reading any of them`, async () => {
    const spy = jest.fn();
    const pages = Array.from({ length: MAX_PAGES + 1 }, () => [item('x', 10, 100)]);
    await expect(readPdfLines(open(pages, spy), new Uint8Array(1))).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a file with more than 2 MB of text, counted in bytes', async () => {
    const line = item('é'.repeat(MAX_TEXT_BYTES / 2 + 1), 10, 100);
    await expect(readPdfLines(open([[line]]), new Uint8Array(1))).rejects.toThrow(new ProviderUnavailableError('The tournament file has too much text'));
    const exact = item('a'.repeat(MAX_TEXT_BYTES), 10, 100);
    expect(await readPdfLines(open([[exact]]), new Uint8Array(1))).toHaveLength(1);
  });

  it('refuses text that adds up over several pages', async () => {
    const page = [item('a'.repeat(MAX_TEXT_BYTES / 2 + 1), 10, 100)];
    await expect(readPdfLines(open([page, page]), new Uint8Array(1))).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is unavailable, with a message and no cause, when the file does not open or a page does not read', async () => {
    const opening = readPdfLines(async () => Promise.reject(new Error('secret 0000')), new Uint8Array(1));
    await expect(opening).rejects.toThrow(new ProviderUnavailableError('The tournament file is not a PDF this reader knows'));
    const reading = readPdfLines(async () => ({ pages: 1, page: async () => Promise.reject(new Error('secret 0000')) }), new Uint8Array(1));
    await expect(reading).rejects.toThrow(new ProviderUnavailableError('The tournament file is not a PDF this reader knows'));
  });

  it('refuses a document with no pages or a page count that is not a count', async () => {
    await expect(readPdfLines(async () => ({ pages: 0, page: async () => [] }), new Uint8Array(1))).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(readPdfLines(async () => ({ pages: Number.NaN, page: async () => [] }), new Uint8Array(1))).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
