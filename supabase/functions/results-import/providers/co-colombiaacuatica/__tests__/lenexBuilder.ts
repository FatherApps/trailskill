// Synthetic LENEX in the shape the platform exports: made up names, made up numbers, never a real file.

export type SyntheticResult = { eventid: string; resultid?: string; swimtime?: string; status?: string };
export type SyntheticAthlete = { athleteid: string; first: string; last: string; birthdate: string; license?: string; club: string; results: SyntheticResult[] };

export const ME: SyntheticAthlete = {
  athleteid: '11',
  first: 'Ana',
  last: 'Prueba',
  birthdate: '2012-03-04',
  license: '1.234.567',
  club: 'Club Sintético',
  results: [
    { eventid: '1', resultid: '101', swimtime: '00:01:05.43' },
    { eventid: '2', resultid: '102', swimtime: '00:00:31.07' },
    { eventid: '3', resultid: '103', swimtime: '01:02:03.04' },
  ],
};

export const OTHER: SyntheticAthlete = {
  athleteid: '12',
  first: 'Bruno',
  last: 'Ajeno',
  birthdate: '2011-09-09',
  license: '7654321',
  club: 'Otro Club',
  results: [{ eventid: '1', resultid: '201', swimtime: '00:01:10.00' }],
};

export const DEFAULT_EVENTS = `
  <SESSION number="1" date="2025-10-18"><EVENTS>
    <EVENT eventid="1" number="1" gender="F"><SWIMSTYLE distance="100" relaycount="1" stroke="FREE"/></EVENT>
    <EVENT eventid="2" number="2" gender="F"><SWIMSTYLE distance="50" relaycount="1" stroke="BACK"/></EVENT>
  </EVENTS></SESSION>
  <SESSION number="2" date="2025-10-19"><EVENTS>
    <EVENT eventid="3" number="3" gender="F"><SWIMSTYLE distance="200" relaycount="1" stroke="MEDLEY"/></EVENT>
    <EVENT eventid="4" number="4" gender="F"><SWIMSTYLE distance="30" relaycount="1" stroke="FREE"/></EVENT>
    <EVENT eventid="5" number="5" gender="F"><SWIMSTYLE distance="100" relaycount="1" stroke="UNKNOWN"/></EVENT>
    <EVENT eventid="6" number="6" gender="F"><SWIMSTYLE distance="100" relaycount="4" stroke="FREE"/></EVENT>
  </EVENTS></SESSION>`;

const resultXml = (r: SyntheticResult) =>
  `<RESULT${r.resultid === undefined ? '' : ` resultid="${r.resultid}"`} eventid="${r.eventid}"${r.swimtime === undefined ? '' : ` swimtime="${r.swimtime}"`}${r.status === undefined ? '' : ` status="${r.status}"`}/>`;

const athleteXml = (a: SyntheticAthlete) =>
  `<ATHLETE athleteid="${a.athleteid}" firstname="${a.first}" lastname="${a.last}" birthdate="${a.birthdate}" gender="F"${a.license === undefined ? '' : ` license="${a.license}"`}>` +
  `<RESULTS>${a.results.map(resultXml).join('')}</RESULTS></ATHLETE>`;

export function lenex({
  course = 'LCM',
  meetName = 'Festival Sintético &amp; Amigos',
  athletes = [ME, OTHER],
  sessions = DEFAULT_EVENTS,
  prolog = '<?xml version="1.0" encoding="UTF-8"?>',
}: { course?: string; meetName?: string; athletes?: SyntheticAthlete[]; sessions?: string; prolog?: string } = {}): string {
  const clubs = [...new Set(athletes.map((a) => a.club))]
    .map((club) => `<CLUB name="${club}"><ATHLETES>${athletes.filter((a) => a.club === club).map(athleteXml).join('')}</ATHLETES></CLUB>`)
    .join('');
  return `${prolog}<LENEX version="3.0"><CONSTRUCTOR name="Synthetic"/><MEETS><MEET name="${meetName}" course="${course}" city="Ciudad"><SESSIONS>${sessions}</SESSIONS><CLUBS>${clubs}</CLUBS></MEET></MEETS></LENEX>`;
}
