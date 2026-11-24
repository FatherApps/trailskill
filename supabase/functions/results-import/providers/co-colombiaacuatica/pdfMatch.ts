import { ProviderUnavailableError, type TournamentAthlete, type TournamentResult, type TournamentSearch } from '../../port.ts';
import type { ParsedPdf } from './pdfResults.ts';
import { plain } from './shared.ts';

// A character the PDF's font could not draw (an accent lost on the way) shows as one of these in the printed name.
const LOST_LETTER = /[?•�]/;

// The wanted word is the printed one when each of its letters is the printed letter or a lost one.
const sameWord = (wanted: string, printed: string) =>
  wanted.length === printed.length && [...printed].every((char, at) => char === wanted[at] || LOST_LETTER.test(char));

const firstWord = (text: string) => plain(text).split(' ')[0] ?? '';

/**
 * The athlete's rows in a PDF, found by what the PDF shows of a person: the birth date (YYMMDD) and the first name and first surname, no accents
 * or capitals, all among the words of the printed name «SURNAMES Names». The sex of the event narrows it when the athlete's is known.
 * Two different printed names for one birth date and those words are two people: it cannot be known which is the athlete, so it is
 * `ProviderUnavailableError`, never a guess. Only the athlete's name, club and rows come out; every other row and every birth date stay here.
 * `athlete.birthDate` is `YYYY-MM-DD`.
 */
export function searchPdf(parsed: ParsedPdf, dateKey: string, athlete: TournamentAthlete & { birthDate: string }): TournamentSearch {
  const [year, month, day] = athlete.birthDate.split('-');
  const wantedBirth = `${year.slice(2)}${month}${day}`;
  const [firstName, surname] = [firstWord(athlete.name.firstName), firstWord(athlete.name.lastName)];
  if (firstName === '' || surname === '') return { found: false };

  const rows = parsed.rows.filter((row) => {
    if (row.birth !== wantedBirth || (athlete.gender !== null && row.gender !== athlete.gender)) return false;
    const words = plain(row.name).split(' ');
    return [firstName, surname].every((wanted) => words.some((word) => sameWord(wanted, word)));
  });
  if (rows.length === 0) return { found: false };
  if (new Set(rows.map((row) => plain(row.name))).size > 1) throw new ProviderUnavailableError('More than one person of the tournament PDF fits the athlete');

  const results = new Map<string, TournamentResult>();
  for (const row of rows) {
    // The key holds the event, the heat and the lane; a PDF without them (0 and 0) is told apart by the position of the age group and of the row. Never a number or a birth date.
    const key = `${dateKey}|pdf|${row.eventNumber}|${row.heat}-${row.lane}${row.heat === 0 && row.lane === 0 ? `|${row.ageGroupIndex}|${row.rowIndex}` : ''}`;
    if (results.has(key)) throw new ProviderUnavailableError('Two rows of the tournament PDF have the same key');
    results.set(key, {
      sourceResultKey: key,
      stroke: row.stroke,
      distance: row.distance,
      pool: parsed.course,
      hundredths: row.hundredths,
      swumOn: parsed.swumOn,
      competition: parsed.competition,
    });
  }
  return { found: true, athlete: { name: rows[0].name, club: rows[0].club }, results: [...results.values()], matchedBy: 'name_and_birth_date', course: parsed.course };
}
