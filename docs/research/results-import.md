# Official results import: data access and identity rule

Research for issue #78 (task 8.1 of delivery phase 8). It answers the open item of the pilot design, sections 6.6 and 10: how FECNA results could be obtained, and how a swimmer in TrailSkill is matched to their official history.

- **Date of research:** 2026-10-24.
- **Status:** findings and a **proposal**. Nothing here is a confirmed product rule until the maintainer decides, with counsel for the legal points.
- **Method:** reading public pages and official documents only. No swimmer history was queried, no form was submitted, and no personal value was stored. Where a number about the source is given, it was computed in memory from the public page source and only the aggregate count was kept.
- **Personal data:** none in this document. Names, ID numbers and birth dates from the source are never reproduced.

## 1. Answer: is there a permitted way to obtain the data?

**No permitted way was found.** The only known source is a public web page with no API, no terms of use, no privacy policy and no statement allowing automated access. Public visibility is not permission (design section 6.6, handoff "FECNA import").

| Possible way | Found? | Evidence |
| --- | --- | --- |
| Documented public API | No | No API or developer documentation on `fecna.com.co` or `ecoapplet.co`; web searches for one returned nothing. |
| Terms of use allowing reuse or automation | No | The vendor's site links "Terms" and "Privacy" to empty placeholders (`#!`). The report pages show no terms. |
| Express permission from FECNA | Not requested | Nobody has asked FECNA yet. This is the only route that could make import permitted. |
| Data delivery agreement (file or feed from FECNA) | Not requested | Same as above. |
| Public report pages | Exist, not permitted for automation | See section 2. |

Sources checked:

- FECNA's site: <https://fecna.com.co/> and <https://fecna.com.co/calendario/>. Neither links to the report pages or to a privacy, data-treatment or terms page. A search for a FECNA data-treatment policy found none; it found FECNA circulars and regulations (for example <https://fecna.com.co/wp-content/uploads/2025/01/CIRCULAR-No-01-FICHA-FECNA-2025.pdf>), none of which covers results reuse.
- Report pages, operated by a software vendor, not on FECNA's domain: <https://ecoapplet.co/fecna/reportes/index> (ranking), <https://ecoapplet.co/fecna/reportes/historial> (individual history) and its form target `historialFilter`. Their footer shows a version label and the vendor's copyright, with no terms.
- `https://ecoapplet.co/robots.txt` returns 404, so there are no crawling rules either way. Absence of rules is not permission.

## 2. How the public source works

Documented from the page structure only.

- **Ranking** (`reportes/index`): filters for date range, competition, gender, athlete type, categories, league, club, event and pool. The maintainer's screenshots show CSV and Excel export buttons. A ranking CSV the maintainer supplied earlier had nine columns: Ranking, Prueba, Nadador, Categoría (Año-mes), Tiempo, Puntos World Aquatics, Fecha Torneo, Liga, Club. It has no ID and no pool column.
- **Individual history** (`reportes/historial`): an HTML form posting to `historialFilter` with fields `inicio` and `fin` (dates, required), `nadador` (swimmer selector), `anual` (group best time per year: yes or no) and `prueba` (all events, or one of 20 individual pool events from 50 m freestyle to 400 m individual medley). There is no login and no captcha. The result page, per the maintainer's screenshots, shows a field labelled **Identificación**, the birth date, club, league, per-event charts and result tables.
- **The swimmer selector is the whole roster.** The page source embeds about 7,166 swimmer entries in one list. Their option values are 6 to 11 digit numbers, 10 digits in most cases, which is consistent with Colombian identity documents (tarjeta de identidad and cédula). This was not confirmed against any person and must be treated as if those values were ID numbers.
- **Names are not unique.** About 660 normalized names (accents and case ignored) appear in more than one entry, covering about 1,421 entries, roughly one in five. These are either different people with the same name or the same person with more than one entry.
- **Coverage, unverified:** the events offered are individual pool events. Relays, open water, other aquatic disciplines and results before the system's start are not known to be covered. Pool length appears in the ranking filter; whether every history row carries it is unverified.
- **Format:** HTML tables, plus CSV and Excel exports on the ranking. No stable machine format, no versioning and no change notice, so any parser would break silently when the vendor changes the page.

## 3. Legal conditions (Law 1581 of 2012)

Quoted from the law's official text: <https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981>. The interpretation in the right-hand column is a research note, not legal advice.

| Provision | Text (abridged) | Why it matters | Counsel? |
| --- | --- | --- | --- |
| Art. 3 g | Treatment is "cualquier operación … tales como la recolección, almacenamiento, uso, circulación o supresión". | Fetching, parsing and storing results is treatment, even from a public page. | — |
| Art. 4 f | Personal data, "salvo la información pública, no podrán estar disponibles en Internet … salvo que el acceso sea técnicamente controlable". | The source exposes what look like ID numbers of minors in an open page. Building on it may mean relying on a publication that itself may not comply. | **Yes** |
| Art. 7 | "Queda proscrito el Tratamiento de datos personales de niños, niñas y adolescentes, salvo aquellos datos que sean de naturaleza pública." | The pilot's reference athletes are 10 to 12 years old. Whether competition results are public-nature data, and how the minor's best interest applies (Constitutional Court ruling C-748 of 2011 and Decree 1377 of 2013, now in Decree 1074 of 2015), decides whether import is possible at all. | **Yes** |
| Art. 9 | Treatment requires "la autorización previa e informada del Titular". | TrailSkill already plans a separate, per-athlete authorization for import (design 6.1 and 8). That covers TrailSkill's side, not the source's. | Yes, for the text |
| Art. 10 b | No authorization is needed for "datos de naturaleza pública". | Even if results were public-nature data, ID numbers and birth dates are not obviously so. TrailSkill must not collect them from the source. | **Yes** |

Questions for counsel:

1. Are a minor's official competition results (name, event, time, date, club, league) public-nature data under articles 7 and 10?
2. Can TrailSkill process results that FECNA delivers under a written agreement, with the guardian's authorization, and who is controller and processor in that arrangement?
3. May TrailSkill read the source's identity values only to compare them, without displaying or storing them, or must they never pass through TrailSkill at all?
4. What happens to imported results when the guardian withdraws the import authorization (retention, already listed as open in design section 8)?

## 4. Proposed identity-matching rule

**Proposed, not confirmed.** It assumes a permitted source exists and that the source gives each swimmer a stable reference. It satisfies design 6.6: the guardian confirms, and the source's ID number and birth date are never displayed.

1. **Started by a person, for one athlete.** Only the guardian or adult athlete starts a search, for an athlete they manage. No background or bulk matching.
2. **Search by name only to find candidates.** Compare the athlete's name and surname with source names after normalization: case, accents, extra spaces and word order ignored. A name match only makes a candidate; it never links on its own.
3. **Show safe fields only.** Each candidate shows full name as the source writes it, clubs and leagues with the years they appear, the years with results and the number of results. Never the ID number, birth date or anything derived from them (such as exact age).
4. **The guardian confirms ("¿Es esta persona?").** Nothing is linked or imported without that explicit confirmation, including when club or league show an earlier affiliation. The confirmation is stored with who, when and what was shown.
5. **Optional extra check, needs counsel.** Instead of showing the source's ID, the guardian may type the athlete's document number and the server only answers "matches" or "does not match". The typed number is not stored and the source's value is never sent to the device. Use it only if counsel approves question 3.
6. **Link to the source's stable reference, not to the name.** After confirmation, store the provider (`co-fecna`), the source's reference and the confirmation evidence. If that reference is an ID number, store only a keyed hash of it, never the number. Later refreshes use this link, never a new name search.
7. **One source reference belongs to one athlete.** If a reference is already linked to another TrailSkill athlete, the new link is refused and the platform administrator reviews it. One athlete may link more than one reference, each confirmed separately, because the same person can appear twice in the source (for example, after moving from tarjeta de identidad to cédula at 18, or after a data-entry error).
8. **Unlinking is possible.** The guardian or the platform administrator can remove a wrong link. What happens to results already imported follows the answer to counsel question 4.
9. **No silent changes.** If the source later changes a result, the app shows the difference for review instead of overwriting (design 6.6, "never silently overwritten").

### Risks

| Risk | How the rule limits it | What remains |
| --- | --- | --- |
| **False match**: about one source entry in five shares its name with another. | Name only creates candidates; the guardian confirms with clubs, leagues and years; optional document check (rule 5). | A guardian can still confirm the wrong homonym, especially when both swam for the same league. Unlinking (rule 8) is the recovery. |
| **Earlier affiliations**: club or league in the source differ from the current school. | Candidates list every club and league with years, and the guardian is told that a past affiliation is expected. | A guardian who does not know the athlete's past clubs may reject the right history. |
| **Duplicate source entries** for one person. | One athlete may link several references (rule 7). | The guardian may confirm one and miss another; history then looks incomplete. |
| **Unstable reference**: the vendor changes values or the page. | Refresh fails loudly and the import is marked unavailable; registration and the app keep working (design 6.6). | Links may need to be redone. |
| **Exposure of identity values** through TrailSkill. | Never displayed, never sent to the device, stored only as a keyed hash. | Depends on counsel question 3. |

## 5. Recommendation

**Ship the pilot without official results import** unless FECNA grants written permission or a data delivery before phase 8 starts. This is the outcome design section 6.6 already defines ("If the research does not confirm one, the pilot ships without it and the maintainer is told").

- Do **not** build an adapter that reads `ecoapplet.co` pages. There is no permission, no terms and no stable format, and the page exposes what look like minors' ID numbers.
- Tasks 8.2, 8.3 and 8.4 stay on hold. The `results-import` module and its `ResultsProvider` port (ADR 0003) remain the right shape once a permitted source exists, so nothing built so far is wasted.
- If the maintainer wants import, the next step is a written request to FECNA, through La Academia or Liga Atlántico, asking for: express authorization (or a data delivery) for one athlete's results at a time at the guardian's request; the delivery format and a stable swimmer reference; whether ID numbers can be left out; and FECNA's data-treatment policy. In parallel, counsel answers the four questions in section 3.

## 6. Question for the maintainer

**Do we ship the pilot without official results import (and keep tasks 8.2 to 8.4 on hold), or do you want to request written authorization or a data delivery from FECNA, and send the four questions in section 3 to counsel, before deciding?**
