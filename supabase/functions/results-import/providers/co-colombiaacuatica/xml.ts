import { ProviderUnavailableError } from '../../port.ts';

export const NOT_LENEX = 'The tournament file is not the LENEX the platform publishes';

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[] };

const MAX_DEPTH = 32;
const NAME = /[A-Za-z_][\w.:-]*/y;
const ATTRIBUTE = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;
// A `&` that is not one of these entities is matched alone, so it can be refused.
const ENTITY = /&(?:(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));)?/g;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as const;

const bad = (): never => {
  throw new ProviderUnavailableError(NOT_LENEX);
};

// The five XML entities and numeric ones; any other `&` is a markup this reader does not know, so the file is refused.
function decode(value: string): string {
  return value.replace(ENTITY, (_match, decimal, hex, name) => {
    if (name !== undefined) return NAMED[name as keyof typeof NAMED];
    if (decimal === undefined && hex === undefined) return bad();
    const code = Number.parseInt(decimal ?? hex, decimal === undefined ? 16 : 10);
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || code === 0) return bad();
    return String.fromCodePoint(code);
  });
}

/**
 * A small XML reader for LENEX, which keeps everything in attributes: elements and attributes only, text between tags is ignored.
 * Fail-closed: a doctype or entity declaration (nothing here expands them), CDATA, a stray `<`, mismatched or unclosed tags,
 * repeated attributes, unquoted values or anything after the root is "unavailable".
 */
export function parseXml(source: string): XmlNode {
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let at = 0;
  while (at < source.length) {
    const open = source.indexOf('<', at);
    const text = source.slice(at, open === -1 ? source.length : open);
    if (text.trim() !== '' && stack.length === 0) bad(); // text outside the root
    if (open === -1) break;
    at = open;
    if (source.startsWith('<!--', at)) {
      const end = source.indexOf('-->', at + 4);
      if (end === -1) bad();
      at = end + 3;
    } else if (source.startsWith('<?', at)) {
      const end = source.indexOf('?>', at + 2);
      if (end === -1) bad();
      at = end + 2;
    } else if (source.startsWith('<!', at)) {
      bad(); // doctype, entity declaration or CDATA
    } else if (source.startsWith('</', at)) {
      NAME.lastIndex = at + 2;
      const match = NAME.exec(source);
      const top = stack.pop();
      if (!match || !top || match[0] !== top.name) bad();
      at = NAME.lastIndex;
      while (/\s/.test(source[at] ?? '')) at++;
      if (source[at] !== '>') bad();
      at++;
    } else {
      NAME.lastIndex = at + 1;
      const match = NAME.exec(source);
      if (!match) bad();
      const node: XmlNode = { name: (match as RegExpExecArray)[0], attrs: {}, children: [] };
      at = NAME.lastIndex;
      for (;;) {
        ATTRIBUTE.lastIndex = at;
        const attribute = ATTRIBUTE.exec(source);
        if (!attribute) break;
        if (Object.hasOwn(node.attrs, attribute[1])) bad();
        node.attrs[attribute[1]] = decode(attribute[2] ?? attribute[3]);
        at = ATTRIBUTE.lastIndex;
      }
      while (/\s/.test(source[at] ?? '')) at++;
      const selfClosing = source[at] === '/';
      if (selfClosing) at++;
      if (source[at] !== '>') bad();
      at++;
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else if (root) bad(); // a second root
      else root = node;
      if (!selfClosing) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) bad();
      }
    }
  }
  if (!root || stack.length > 0) bad();
  return root as XmlNode;
}
