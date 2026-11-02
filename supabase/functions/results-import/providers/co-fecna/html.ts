const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', uuml: 'ü', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Uuml: 'Ü', Ntilde: 'Ñ',
};

/** The page's markup is not ours: any entity this does not know means the page changed, never a guess. */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (_match, decimal, hex, name) => {
    if (name !== undefined) {
      if (!(name in NAMED)) throw new Error('Unknown HTML entity');
      return NAMED[name];
    }
    return String.fromCodePoint(Number.parseInt(decimal ?? hex, decimal === undefined ? 16 : 10));
  });
}

export const normalizeSpaces = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text of a fragment: tags dropped, entities decoded, spaces collapsed. */
export const cellText = (html: string) => normalizeSpaces(decodeEntities(html.replace(/<[^>]*>/g, '')));
