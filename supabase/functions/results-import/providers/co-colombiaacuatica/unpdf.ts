import type { OpenPdf } from './pdfLines.ts';

/**
 * Opens a real PDF with unpdf (the only dependency this takes, issue #1482; pdf.js inside, built for serverless runtimes). There is no import
 * map, so the exact version is in the specifier. The import is dynamic so that nothing loads it until a PDF has to be read: the Jest tests
 * never open a real file, and a lookup that finds a Lenex zip never pays for it. Only the text and its position of each item come out.
 */
export const openWithUnpdf: OpenPdf = async (bytes) => {
  const { getDocumentProxy } = await import('npm:unpdf@2.1.0');
  const pdf = await getDocumentProxy(bytes);
  return {
    pages: pdf.numPages,
    async page(index) {
      const { items } = await (await pdf.getPage(index + 1)).getTextContent();
      return items.flatMap((item) => {
        const { str, transform } = item as { str?: unknown; transform?: unknown };
        return typeof str === 'string' && Array.isArray(transform) ? [{ text: str, x: Number(transform[4]), y: Number(transform[5]) }] : [];
      });
    },
  };
};
