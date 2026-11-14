import { ProviderUnavailableError } from '../../../port.ts';
import { parseXml } from '../xml.ts';

describe('parseXml attributes', () => {
  it('keeps them in an object without prototype, so nothing is read from Object.prototype', () => {
    const { attrs } = parseXml('<A b="1"/>');
    expect(Object.getPrototypeOf(attrs)).toBeNull();
    expect(attrs.b).toBe('1');
    expect(attrs.constructor).toBeUndefined();
    expect(attrs.toString).toBeUndefined();
    expect('hasOwnProperty' in attrs).toBe(false);
  });

  it('takes __proto__ and constructor as plain attributes: no pollution, the others unchanged', () => {
    const { attrs } = parseXml('<A a="1" __proto__="polluted" constructor="c" b="2"/>');
    expect(Object.keys(attrs)).toEqual(['a', '__proto__', 'constructor', 'b']);
    expect(attrs.__proto__).toBe('polluted');
    expect(attrs.constructor).toBe('c');
    expect([attrs.a, attrs.b]).toEqual(['1', '2']);
    expect(Object.getPrototypeOf(attrs)).toBeNull();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('still refuses a repeated __proto__ attribute', () => {
    expect(() => parseXml('<A __proto__="1" __proto__="2"/>')).toThrow(ProviderUnavailableError);
  });

  it('turns a literal tab or line break in a value into one space each, like XML does', () => {
    expect(parseXml('<A v="a\tb\nc\r\nd\re"/>').attrs.v).toBe('a b c d e');
  });

  it('keeps a character reference to a line break as the character it names', () => {
    expect(parseXml('<A v="a&#10;b"/>').attrs.v).toBe('a\nb');
  });

  it.each(['\u0001', '\u0008', '\u000b', '\u001f'])('refuses the whole file for a control character in a value (%j): it is not well-formed XML', (control) => {
    expect(() => parseXml(`<A v="a${control}b"/>`)).toThrow(ProviderUnavailableError);
  });
});
