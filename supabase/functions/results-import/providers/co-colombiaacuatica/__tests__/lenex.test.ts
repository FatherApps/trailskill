import { ProviderUnavailableError } from '../../../port.ts';
import { searchLenex } from '../lenex.ts';
import { DEFAULT_EVENTS, ME, OTHER, lenex, type SyntheticAthlete } from './lenexBuilder.ts';

const TOURNAMENT = '20251018';
const NUMBER = '1234567';
const unavailable = (xml: string, number = NUMBER) => expect(() => searchLenex(xml, TOURNAMENT, number)).toThrow(ProviderUnavailableError);

function found(xml: string, number = NUMBER) {
  const search = searchLenex(xml, TOURNAMENT, number);
  if (!search.found) throw new Error('Expected a match');
  return search;
}

describe('searchLenex', () => {
  it('gives the rows of the one athlete whose license matches', () => {
    const { results } = found(lenex());
    expect(results).toEqual([
      { sourceResultKey: '20251018|1|101', stroke: 'FR', distance: '100m', pool: 'LCM', hundredths: 6543, swumOn: '2025-10-18', competition: 'Festival Sintético & Amigos' },
      { sourceResultKey: '20251018|2|102', stroke: 'BK', distance: '50m', pool: 'LCM', hundredths: 3107, swumOn: '2025-10-18', competition: 'Festival Sintético & Amigos' },
      { sourceResultKey: '20251018|3|103', stroke: 'IM', distance: '200m', pool: 'LCM', hundredths: 372304, swumOn: '2025-10-19', competition: 'Festival Sintético & Amigos' },
    ]);
  });

  it('gives the name and club of that athlete, to ask "is this the person?"', () => {
    expect(found(lenex()).athlete).toEqual({ name: 'Ana Prueba', club: 'Club Sintético' });
  });

  it('says "no matches" when no athlete has the license', () => {
    expect(searchLenex(lenex({ athletes: [OTHER] }), TOURNAMENT, NUMBER)).toEqual({ found: false });
  });

  it('is unavailable when two athletes share the license', () => {
    unavailable(lenex({ athletes: [ME, { ...OTHER, license: '1234567' }] }));
  });

  it('compares the license normalized like the identity number', () => {
    expect(found(lenex({ athletes: [{ ...ME, license: ' 1-234.567 ' }] })).results).toHaveLength(3);
    expect(found(lenex({ athletes: [{ ...ME, license: 'ab12' }] }), 'AB-12').results).toHaveLength(3);
  });

  it('never matches an athlete without a readable license', () => {
    const odd: SyntheticAthlete[] = [{ ...OTHER, license: undefined }, { ...OTHER, athleteid: '13', license: '!!' }, { ...OTHER, athleteid: '14', license: '' }];
    expect(searchLenex(lenex({ athletes: odd }), TOURNAMENT, NUMBER)).toEqual({ found: false });
  });

  it.each([
    ['SCM', 'SCM'],
    ['LCM', 'LCM'],
  ])('maps course %s to pool %s', (course, pool) => {
    expect(found(lenex({ course })).results.every((r) => r.pool === pool)).toBe(true);
  });

  it.each(['SCY', 'lcm', '', 'LCM '])('is unavailable on course "%s"', (course) => {
    unavailable(lenex({ course }));
  });

  it('converts every swimtime to exact hundredths', () => {
    const athlete = { ...ME, results: [{ eventid: '1', resultid: '1', swimtime: '00:00:59.99' }, { eventid: '1', resultid: '2', swimtime: '00:10:00.01' }, { eventid: '1', resultid: '3', swimtime: '01:00:00.00' }] };
    expect(found(lenex({ athletes: [athlete] })).results.map((r) => r.hundredths)).toEqual([5999, 60001, 360000]);
  });

  it.each(['1:05.43', '00:01:05', '00:01:05.4', '00:61:05.43', '00:01:60.00', 'abc', '00:01:05,43'])('is unavailable on swimtime "%s"', (swimtime) => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', resultid: '1', swimtime }] }] }));
  });

  it('keeps a missing time as null, never 0', () => {
    const athlete = { ...ME, results: [{ eventid: '1', resultid: '1' }, { eventid: '1', resultid: '2', swimtime: '00:00:00.00' }, { eventid: '1', resultid: '3', swimtime: '00:01:10.00', status: 'DSQ' }] };
    expect(found(lenex({ athletes: [athlete] })).results.map((r) => r.hundredths)).toEqual([null, null, null]);
  });

  it('leaves out events outside the catalogs and relays', () => {
    const athlete = { ...ME, results: [{ eventid: '4', resultid: '1', swimtime: '00:00:20.00' }, { eventid: '5', resultid: '2', swimtime: '00:01:00.00' }, { eventid: '6', resultid: '3', swimtime: '00:04:00.00' }, { eventid: '1', resultid: '4', swimtime: '00:01:00.00' }] };
    expect(found(lenex({ athletes: [athlete] })).results.map((r) => r.sourceResultKey)).toEqual(['20251018|1|4']);
  });

  it('is unavailable when a result points at an event the file does not have', () => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '99', resultid: '1', swimtime: '00:01:00.00' }] }] }));
  });

  it('never outputs a birth date or anything of the other participants (checked on the JSON)', () => {
    const json = JSON.stringify(found(lenex()));
    for (const secret of ['2012-03-04', '2011-09-09', 'Bruno', 'Ajeno', 'Otro Club', '7654321', '1.234.567', NUMBER, 'birth']) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain('201'); // the other athlete's result id
    expect(JSON.stringify(searchLenex(lenex({ athletes: [OTHER] }), TOURNAMENT, NUMBER))).toBe('{"found":false}');
  });

  it('builds the key from the tournament folder, the event and the result, never from the license', () => {
    const keys = found(lenex()).results.map((r) => r.sourceResultKey);
    expect(keys).toEqual(['20251018|1|101', '20251018|2|102', '20251018|3|103']);
    for (const key of keys) expect(key).not.toContain(NUMBER);
  });

  it('gives the same keys when the same file is read twice', () => {
    const xml = lenex();
    expect(found(xml).results.map((r) => r.sourceResultKey)).toEqual(found(xml).results.map((r) => r.sourceResultKey));
  });

  it('is unavailable when a key would hold the license, or an id is not plain', () => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', resultid: '1234567', swimtime: '00:01:00.00' }] }] }));
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', resultid: 'a|b', swimtime: '00:01:00.00' }] }] }));
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', swimtime: '00:01:00.00' }] }] }));
  });

  it('is unavailable when two results of the athlete give the same key', () => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', resultid: '1', swimtime: '00:01:00.00' }, { eventid: '1', resultid: '1', swimtime: '00:01:01.00' }] }] }));
  });

  it('is unavailable when two events share an id', () => {
    unavailable(lenex({ sessions: DEFAULT_EVENTS + DEFAULT_EVENTS.replace('number="1"', 'number="7"') }));
  });

  it.each([
    ['not xml', '<html><body>404</body></html>'],
    ['empty', ''],
    ['unclosed tags', '<LENEX version="3.0"><MEETS><MEET name="a" course="LCM">'],
    ['other root', lenex().replace(/LENEX/g, 'OTHER')],
    ['no meet', '<LENEX version="3.0"><MEETS></MEETS></LENEX>'],
    ['two meets', lenex().replace('</MEETS>', '<MEET name="b" course="LCM"/></MEETS>')],
    ['no session date', lenex({ sessions: DEFAULT_EVENTS.replace('date="2025-10-18"', '') })],
    ['an impossible session date', lenex({ sessions: DEFAULT_EVENTS.replace('2025-10-18', '2025-02-30') })],
    ['a session date with month 13', lenex({ sessions: DEFAULT_EVENTS.replace('2025-10-18', '2025-13-45') })],
    ['a doctype', lenex({ prolog: '<!DOCTYPE LENEX [<!ENTITY a "b">]>' })],
    ['an unknown entity', lenex({ meetName: 'Copa &nbsp; X' })],
    ['an attribute without quotes', lenex().replace('course="LCM"', 'course=LCM')],
  ])('is unavailable on %s', (_label, xml) => {
    unavailable(xml);
  });

  it('decodes the five XML entities and numeric ones, and collapses spaces in the meet name', () => {
    const { results } = found(lenex({ meetName: '  Copa &quot;A&quot; &lt;1&gt; &#241;  &#x41; &apos;x&apos;  ' }));
    expect(results[0].competition).toBe('Copa "A" <1> ñ A \'x\'');
  });

  it('survives a comment, CDATA-free text between tags and attributes in single quotes', () => {
    const xml = lenex().replace('<MEETS>', "<!-- a comment -->\n  <MEETS>").replace('course="LCM"', "course='LCM'");
    expect(found(xml).results).toHaveLength(3);
  });
});
