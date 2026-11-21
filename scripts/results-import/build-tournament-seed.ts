// Manual tool, run by a person with Deno; never by the app or CI. Builds the reviewed catalog of 2024 and 2025 tournaments.
//
//   deno run --allow-read --allow-write --allow-net=<platform host> scripts/results-import/build-tournament-seed.ts <sources.json>
//
// <sources.json>: { "urls": ["<known tournament address>", ...],
//                   "named": [{ "url": "<address>", "name": "...", "city": "...", "discipline": "..." }] }
// `urls` are addresses found in search results, news and the platform's calendar pages; `named` are tournaments whose name and city a
// source WITHOUT athletes already gives (they are used instead of downloading anything). For every other key the tournament's own file is
// downloaded in memory and only its MEET header is read; the rest is dropped. Nothing is stored, and the log holds only `<date_key> <status>`.
// It prints the rows added or changed and the keys it could not resolve, with the coverage by year, to paste in the pull request.
import type { TournamentEntry } from '../../supabase/functions/results-import/port.ts';
import { buildSeed, type Sources } from './seedBuilder.ts';

const SEED_FILE = new URL('../../supabase/functions/results-import/providers/co-colombiaacuatica/tournaments-2024-2025.json', import.meta.url);

const [sourcesPath] = Deno.args;
if (!sourcesPath) {
  console.error('usage: build-tournament-seed.ts <sources.json>');
  Deno.exit(2);
}
const sources = JSON.parse(await Deno.readTextFile(sourcesPath)) as Sources;
const existing = JSON.parse(await Deno.readTextFile(SEED_FILE).catch(() => '[]')) as TournamentEntry[];

const result = await buildSeed(sources, existing, {
  fetchImpl: fetch,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (line) => console.error(line),
});

await Deno.writeTextFile(SEED_FILE, `${JSON.stringify(result.rows, null, 2)}\n`);
console.log(JSON.stringify({ added: result.added, changed: result.changed, unresolved: result.unresolved, coverage: result.coverage }, null, 2));
