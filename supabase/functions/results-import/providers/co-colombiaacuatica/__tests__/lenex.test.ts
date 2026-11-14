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

  const DOUBT = new ProviderUnavailableError('The tournament file has participants with an unreadable license, so the person cannot be ruled out');
  // No license at all is no claim of identity (many minors have none): it cannot be the person, in either path.
  const withoutLicense: [string, SyntheticAthlete][] = [
    ['no license', { ...OTHER, license: undefined }],
    ['an empty license', { ...OTHER, license: '' }],
    ['a blank license', { ...OTHER, license: ' \t ' }],
  ];
  // A license that is there but cannot be read may be the person written badly: doubt, so unavailable, in either path.
  const unreadable: SyntheticAthlete = { ...OTHER, license: '!!' };

  it.each(withoutLicense)('says "no matches" when nobody matches and an athlete has %s', (_label, odd) => {
    expect(searchLenex(lenex({ athletes: [OTHER, odd] }), TOURNAMENT, NUMBER)).toEqual({ found: false });
  });

  it.each(withoutLicense)('gives the rows of the one match when another athlete has %s', (_label, odd) => {
    expect(found(lenex({ athletes: [ME, { ...odd, athleteid: '99' }] })).results).toHaveLength(3);
  });

  it('is unavailable, not "no matches", when nobody matches and an athlete has an unreadable license', () => {
    expect(() => searchLenex(lenex({ athletes: [OTHER, unreadable] }), TOURNAMENT, NUMBER)).toThrow(DOUBT);
  });

  it('is unavailable, not the match alone, when an athlete has an unreadable license (same as when nobody matches)', () => {
    expect(() => searchLenex(lenex({ athletes: [ME, { ...unreadable, athleteid: '99' }] }), TOURNAMENT, NUMBER)).toThrow(DOUBT);
  });

  it('says "no matches" when every license is readable and none is the number', () => {
    expect(searchLenex(lenex({ athletes: [OTHER, { ...OTHER, athleteid: '13', license: 'AB-12' }] }), TOURNAMENT, NUMBER)).toEqual({ found: false });
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

  describe('technique', () => {
    const style = (technique?: string) => `<SWIMSTYLE distance="100" relaycount="1" stroke="FREE"${technique === undefined ? '' : ` technique="${technique}"`}/>`;
    const withTechniques = (techniques: (string | undefined)[], results: { eventid: string; resultid: string; swimtime: string }[]) =>
      lenex({
        sessions: `<SESSION number="1" date="2025-10-18"><EVENTS>${techniques.map((t, i) => `<EVENT eventid="${i + 1}" number="${i + 1}" gender="F">${style(t)}</EVENT>`).join('')}</EVENTS></SESSION>`,
        athletes: [{ ...ME, results }],
      });
    const time = (eventid: string, swimtime = '00:01:00.00') => ({ eventid, resultid: `r${eventid}`, swimtime });

    it.each(['KICK', 'PULL', 'START', 'TURN', 'DRILL', 'REGULAR', 'SOMETHING_NEW'])('leaves out an event with technique "%s"', (technique) => {
      expect(found(withTechniques([technique], [time('1')])).results).toEqual([]);
    });

    it('imports an event without technique or with an empty one', () => {
      expect(found(withTechniques([undefined, ''], [time('1'), time('2')])).results.map((r) => r.sourceResultKey)).toEqual(['20251018|1|r1', '20251018|2|r2']);
    });

    it('keeps only the real swim when a kick set and a swim have the same stroke and distance, so it cannot become the best time', () => {
      const { results } = found(withTechniques(['KICK', undefined], [time('1', '00:00:50.00'), time('2', '00:01:10.00')]));
      expect(results.map((r) => r.hundredths)).toEqual([7000]);
      expect(Math.min(...results.map((r) => r.hundredths as number))).toBe(7000);
    });
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

  it('accepts a number that is only part of an id or of the tournament folder', () => {
    const athlete = { ...ME, license: '10', results: [{ eventid: '1', resultid: '101', swimtime: '00:01:00.00' }, { eventid: '2', resultid: '5100', swimtime: '00:01:00.00' }] };
    // '10' is inside the tournament '20251018' and both result ids, but no segment of the key is the number.
    expect(found(lenex({ athletes: [athlete] }), '10').results.map((r) => r.sourceResultKey)).toEqual(['20251018|1|101', '20251018|2|5100']);
  });

  it.each([
    ['the result id', { eventid: '1', resultid: '1234567' }, TOURNAMENT],
    ['the result id, normalized', { eventid: '1', resultid: '1234-567' }, TOURNAMENT],
    ['the event id', { eventid: '1234567', resultid: '1' }, TOURNAMENT],
    ['the tournament folder', { eventid: '1', resultid: '1' }, NUMBER],
  ])('is unavailable, with its own message, when %s is the identity number', (_label, ids, tournament) => {
    const athlete = { ...ME, results: [{ ...ids, swimtime: '00:01:00.00' }] };
    const xml = lenex({ athletes: [athlete], sessions: DEFAULT_EVENTS.replace('eventid="1"', `eventid="${ids.eventid}"`) });
    expect(() => searchLenex(xml, tournament, NUMBER)).toThrow(new ProviderUnavailableError('A result key of the tournament file would be the identity number'));
  });

  it('is unavailable when the result has no id', () => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', swimtime: '00:01:00.00' }] }] }));
  });

  it('is unavailable when a result points to an event the file does not have', () => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '99', resultid: '1', swimtime: '00:01:00.00' }] }] }));
  });

  it.each([
    ['a "|"', 'a|b'],
    ['a space inside', '10 1'],
    ['a line break inside', '10\n1'],
    ['nothing', ''],
  ])('leaves out only the row whose result id is not plain (%s), not the whole file', (_label, resultid) => {
    const athlete = { ...ME, results: [{ eventid: '1', resultid, swimtime: '00:01:00.00' }, ...ME.results.slice(1)] };
    expect(found(lenex({ athletes: [athlete] })).results.map((r) => r.sourceResultKey)).toEqual(['20251018|2|102', '20251018|3|103']);
  });

  it('reads an event id with a line break around it as the event id, and leaves out the row if it is not plain after that', () => {
    const xml = lenex();
    const around = xml.replace('resultid="101" eventid="1"', 'resultid="101" eventid="1\n"');
    expect(found(around).results.map((r) => r.sourceResultKey)).toEqual(['20251018|1|101', '20251018|2|102', '20251018|3|103']);
    const inside = xml.replace('resultid="101" eventid="1"', 'resultid="101" eventid="1\n1"').replace('eventid="1" number', 'eventid="1\n1" number');
    expect(found(inside).results.map((r) => r.sourceResultKey)).toEqual(['20251018|2|102', '20251018|3|103']);
  });

  it('collapses the spaces of an athlete name that has a tab or a line break', () => {
    expect(found(lenex({ athletes: [{ ...ME, first: 'Ana\tMaría', last: 'Prueba\nUno' }] })).athlete.name).toBe('Ana María Prueba Uno');
  });

  it('is unavailable on a control character in a value', () => {
    unavailable(lenex({ meetName: 'Copa\u0001X' }));
  });

  it('is unavailable when two results of the athlete give the same key', () => {
    unavailable(lenex({ athletes: [{ ...ME, results: [{ eventid: '1', resultid: '1', swimtime: '00:01:00.00' }, { eventid: '1', resultid: '1', swimtime: '00:01:01.00' }] }] }));
  });

  it('skips a club without athletes (a relay-only club) and keeps looking', () => {
    const xml = lenex().replace('</CLUBS>', '<CLUB name="Solo relevos"/><CLUB name="Vacío"><RELAYS/></CLUB></CLUBS>');
    expect(found(xml).results).toHaveLength(3);
    expect(searchLenex(lenex({ athletes: [] }).replace('<CLUBS></CLUBS>', '<CLUBS><CLUB name="Solo relevos"/></CLUBS>'), TOURNAMENT, NUMBER)).toEqual({ found: false });
  });

  it('finds an athlete without results as a match with no rows', () => {
    const noElement = lenex({ athletes: [{ ...ME, results: [] }] }).replace('<RESULTS></RESULTS>', '');
    const emptyElement = lenex({ athletes: [{ ...ME, results: [] }] });
    for (const xml of [noElement, emptyElement]) {
      expect(searchLenex(xml, TOURNAMENT, NUMBER)).toEqual({ found: true, athlete: { name: 'Ana Prueba', club: 'Club Sintético' }, results: [] });
    }
  });

  it.each([
    ['no SESSIONS', lenex().replace(/<SESSIONS>.*<\/SESSIONS>/s, '')],
    ['a session without EVENTS', lenex({ sessions: '<SESSION number="1" date="2025-10-18"></SESSION>' })],
  ])('is still unavailable with %s', (_label, xml) => {
    unavailable(xml);
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

  describe('pool course', () => {
    const rowsOf = (xml: string) => found(xml).results.map((r) => [r.sourceResultKey, r.pool]);
    const noMeetCourse = (xml: string) => xml.replace(' course="LCM"', '');
    const inSession = (xml: string, number: number, course: string) => xml.replace(`<SESSION number="${number}" date`, `<SESSION number="${number}" course="${course}" date`);

    it('reads it from MEET/POOL when MEET has no course', () => {
      const xml = noMeetCourse(lenex()).replace('<SESSIONS>', '<POOL name="Piscina" course="SCM"/><SESSIONS>');
      expect(rowsOf(xml)).toEqual([['20251018|1|101', 'SCM'], ['20251018|2|102', 'SCM'], ['20251018|3|103', 'SCM']]);
    });

    it('gives each row the course of its own session when the tournament has two', () => {
      const xml = inSession(lenex(), 2, 'SCM');
      expect(rowsOf(xml)).toEqual([['20251018|1|101', 'LCM'], ['20251018|2|102', 'LCM'], ['20251018|3|103', 'SCM']]);
    });

    it('reads the course of a session from its POOL', () => {
      const xml = lenex().replace('<EVENTS>\n    <EVENT eventid="3"', '<POOL course="SCM"/><EVENTS>\n    <EVENT eventid="3"');
      expect(rowsOf(xml).map(([, pool]) => pool)).toEqual(['LCM', 'LCM', 'SCM']);
    });

    it('does not guess: a session whose course is not recognized leaves out its rows, and only those', () => {
      expect(rowsOf(inSession(lenex(), 2, 'XYZ'))).toEqual([['20251018|1|101', 'LCM'], ['20251018|2|102', 'LCM']]);
      expect(rowsOf(inSession(inSession(lenex({ course: 'lcm' }), 1, 'SCM'), 2, 'LCM'))).toHaveLength(3);
    });

    it('does not guess: no course for the whole meet (unknown, or two different ones) is unavailable', () => {
      unavailable(lenex().replace('<SESSIONS>', '<POOL course="SCM"/><SESSIONS>'));
      unavailable(inSession(lenex({ course: 'lcm' }), 1, 'SCM'));
    });

    it('is unavailable when a session has no course anywhere', () => {
      unavailable(noMeetCourse(lenex()));
      unavailable(inSession(noMeetCourse(lenex()), 1, 'LCM'));
    });
  });
});
