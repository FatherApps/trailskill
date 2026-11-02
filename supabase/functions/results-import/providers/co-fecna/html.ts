// Named entities of text only (letters, quotes, dashes, spaces), as HTML5 spells them. Names are case-sensitive.
// Anything outside this table is unknown on purpose: the entry that holds it fails, see `UnknownEntityError`.
const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  Acirc: 'Â', Ecirc: 'Ê', Icirc: 'Î', Ocirc: 'Ô', Ucirc: 'Û',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü',
  atilde: 'ã', otilde: 'õ', aring: 'å', ccedil: 'ç', ntilde: 'ñ', yacute: 'ý', yuml: 'ÿ',
  Atilde: 'Ã', Otilde: 'Õ', Aring: 'Å', Ccedil: 'Ç', Ntilde: 'Ñ', Yacute: 'Ý',
  lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201A', ldquo: '\u201C', rdquo: '\u201D', bdquo: '\u201E', laquo: '«', raquo: '»',
  ndash: '\u2013', mdash: '\u2014', hellip: '…', middot: '·', ordf: 'ª', ordm: 'º', iexcl: '¡', iquest: '¿',
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
};

/** An entity this does not know: the entry that holds it is unreadable, but the rest of the page may still be fine. */
export class UnknownEntityError extends Error {
  constructor() {
    super('Unknown HTML entity');
  }
}

/** The page's markup is not ours: an entity this does not know is never guessed, it throws `UnknownEntityError`. */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (_match, decimal, hex, name) => {
    if (name !== undefined) {
      if (!Object.hasOwn(NAMED, name)) throw new UnknownEntityError();
      return NAMED[name];
    }
    const code = Number.parseInt(decimal ?? hex, decimal === undefined ? 16 : 10);
    // Beyond Unicode or a lone surrogate: no character, so unknown.
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new UnknownEntityError();
    return String.fromCodePoint(code);
  });
}

export const normalizeSpaces = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text of a fragment: tags dropped, entities decoded, spaces collapsed. */
export const cellText = (html: string) => normalizeSpaces(decodeEntities(html.replace(/<[^>]*>/g, '')));
