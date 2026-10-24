# TrailSkill — product and collaboration handoff

Date: 2026-10-24 (America/Bogota)  
Status: product discovery; project name **TrailSkill** decided; project folder `~/DEVS/trailskill` created (not yet a Git repository). No implementation, remote repository, or tracker yet.

## Resume here

1. Work from `~/DEVS/trailskill`, which is now the source of truth. Read this document and `ENGRAM-RECOVERY-2026-10-24.md`. The originals in `~/Documents/ChatGPT/Aplicación para la gestion de deportistas/` are a historical copy and are no longer updated.
2. Continue product discovery with Superpowers. Do not scaffold, install dependencies, or treat this handoff as an approved implementation design.
3. The brand is settled (TrailSkill). Next: explicitly define and approve the Git/team workflow, then initialize Git in this folder (`git -C ~/DEVS/trailskill init`) before creating a remote repository or dispatching coding agents.

**Important distinction:** “Confirmed” below records user decisions. “Proposed” is not approved. “Open” must not be silently filled in by an agent.

## Product intent and pilot

Build a modular athlete-development platform for multiple schools and, eventually, multiple sports. Start with swimming in Colombia. La Academia (Liga Atlántico) is the pilot school, not the product brand. Reference minors are about 10–12 years old; support for other ages was discussed, and adult self-registration is now explicitly required.

The user will consider the pilot successful when it can:

1. Show the results of each registered swimmer.
2. Show the swimmers belonging to a school.
3. Show a swimmer's historical records, trends, and future projections.
4. Keep recording periodic training-time measurements to show progress.
5. Be downloadable from Google Play, with registration by a guardian for a minor or directly by an adult.
6. Offer a school console for its swimmers and their data, coach registration, and records by category.
7. Use the separate time recorder the user will provide, assigning captured times to swimmers by stroke and distance.

These are outcomes, not evidence that every technical integration is already feasible.

## Confirmed product rules

### People, schools, and plans

- Guardian accounts manage minor athlete profiles. Minors have no independent login in the initial scope. Adults may register themselves. Athlete profiles and user accounts are separate concepts.
- An athlete may belong to multiple schools and work with multiple coaches; a school has multiple athletes and coaches.
- Training groups organize collective plans and are not necessarily federation categories.
- Coaches can assign exercise plans to an athlete, a school group/category, or a school. Exercises may specify repetitions, distances, strokes, and equipment. Fulfillment and comments are recorded per athlete. Guardians can report from the athlete profile; coaches manage their assigned athletes' records.
- Exact plan versioning/assignment semantics and whether every plan feature is needed for pilot acceptance remain open.

### Results and timing

- Some work records completion without a time. Other work records repetition times, series totals, continuous race times, or distance splits. Repetitions and splits are different; missing time is not zero.
- Periodic training measurements, historical results, and trends belong in the initial pilot. The user will provide another programmer's Kotlin button-controlled timer; its source, protocol, precision, and integration have not been validated. It is **initial-scope intent**, not a completed integration.
- Future-time projections are desired, but the definition, method, confidence, and presentation are deliberately deferred for later investigation. Do not invent a formula or claim accuracy now.

### Access, offline use, and auditability

- Authorized own-school data must remain usable offline, including recording. Multiple coaches may edit the same session from different devices. Preserve authorship and change history; a platform administrator resolves conflicting corrections with an auditable decision.
- Viewing results originating at another school requires authorization from that school's administrator. External-school shared results are online-only for the initial product. Do not infer permission to share other record types.
- Retain evidence of personal-data processing authorization: accepted full text/version, adult identity and validated representation, athlete, purposes, time, and acceptance event. FECNA import, school-to-school sharing, and LLM processing must not be inferred from one blanket acceptance. Legal/controller/retention details remain to be validated.

### FECNA import

- An optional, authorized import of an individual swimmer's existing official results is part of the **initial scope**, with a later manual refresh option. Registration must remain possible when FECNA is unavailable or no published record exists. No bulk national scraping or collection of unrelated athletes.
- The public ranking shows swimmer name, club/league, event, time, and other ranking fields. On the history search, a swimmer is selected by name. User-provided screenshots of the resulting history page visibly show a field labeled **Identificación**, plus birth date, club, league, event-specific charts, and result tables. This corrects the earlier assumption that the public view exposed only names. Do not reproduce the minor's personal values from those screenshots.
- The guardian should confirm the selected history before import, including when club/league reflects an earlier affiliation. A safe identity-comparison rule is still to be approved; the user explicitly deferred deeper FECNA technical research until development.
- Public visibility does not prove a stable API, permission for automation, or complete retrieval. Preserve source/provenance, avoid duplicates and silent source corrections. Relevant pages: <https://ecoapplet.co/fecna/reportes/index>, <https://ecoapplet.co/fecna/reportes/historial>, and the selected-result POST route <https://ecoapplet.co/fecna/reportes/historialFilter>.

## Phases — status, not invented commitments

| Phase | Scope | Status |
| --- | --- | --- |
| Discovery/design | Product rules, roles, pilot acceptance, brand, design system, team workflow, approved architecture | In progress |
| Initial pilot | Seven outcomes above, optional FECNA import, guardian/adult registration, school console, training-time recorder, required permissions/consent/offline behavior | User-intended; detailed design and feasibility pending |
| Later candidates | Personalized LLM features, nutrition/psychology ideas validated by professionals, wearables, video analysis, social features, and broader sports expansion | Not approved as initial scope; sequencing open |

Android-first React Native + Expo is a confirmed mobile direction, with future iOS considered from the start. A Google Play developer account exists. Backend, hosting, durable offline synchronization, and the school-console platform are not chosen. The design system is being explored through a Claude Design prompt; no returned design or approval is recorded here.

## Brand profile and naming state

- The project/app needs its own brand independent of La Academia and not restricted to swimming.
- Desired associations: training, guidance, support, strengthening, strategy, achievements, self-knowledge, personal history, and understanding one's own data.
- Names built on **“Atle-”** were rejected as hard to say. Prefer easy words or simple combinations.
- Later clarification: new candidates must be **one word only**, not two-word combinations. This supersedes the earlier suggestion of multiword names.
- Current user shortlist: **Rumbo, Trazo, Impulso**. None is final. Preliminary public searches found existing adjacent uses for all three (respectively a sports GPS service, a Colombian software company and golf-tracer app, and fitness apps); formal Colombian trademark, domain, and store checks remain open.
- Exploratory names included Atletraza/Atleruta/Atlemeta and later Rombo Vivo, Rombo Meta, Rumbo Claro, Rumbo Propio, and Mi Trayecto. **None was chosen.** The user's later shortlist explicitly says **Rumbo**, resolving the earlier “rombo” ambiguity for this shortlist.
- Preliminary web screening found existing uses for some nearby names (including a standalone Rumbo app). No candidate has trademark, domain, or Google Play clearance. Do not treat search silence as availability.
- **Confirmed 2026-10-24: the project name is TrailSkill.** The user accepted a two-part English compound, superseding the one-word rule for this name. Intent: "skill" = an athlete's sport-dependent qualities; "trail" = following how those qualities improve over time.
  - Preliminary screening (web search + WHOIS/RDAP, 2026-10-24): no app, company, or trademark found under TrailSkill; trailskill.com, .co, .io, and .app were unregistered. Not a SIC/USPTO search; registration status can change at any time.
  - Known caveats: in English it can read as "trail skills" (trail running/MTB technique, unverified); English word order says "skills of the trail" rather than "the trail of your skills"; Spanish speakers may say "treil-eskil".
  - Rejected during screening: Trazo (trazo.co, Colombian payments platform), Vector (Catapult Vector athlete monitoring), Upskill (Cambridge app, edtech and US marks), Trace2Skill (Alibaba/Qwen paper), Skill2Trace and TraceSkill (search redirects to Trace2Skill/AI; traceskill.com parked), Traceroute (network tool), SkillArc, SkillTrail, SkillTrack (existing apps/companies, domains taken), Nivela (user not convinced).
  - Keep the Android applicationId neutral (company-based), because it cannot change after the first Google Play release; the display name can.

## Gitflow and all-agent team strategy

**No Gitflow has been agreed.** The project folder `~/DEVS/trailskill` exists but is not yet a Git repository; it contains only this handoff and the recovery document, with no code or origin. Therefore no issue tracker, branch, worktree, PR, CI, or merge policy exists for this project yet. Do not report the following proposal as a user decision.

**Working proposal for the next discussion:** choose one repository/tracker owner; make each bounded behavior an issue with acceptance criteria; use short-lived issue-linked feature branches in separate worktrees; let agents own disjoint changes rather than share a checkout; require tests and a reviewed PR before integration; protect the default branch; use Conventional Commits with no AI attribution; designate a human decision-maker for scope, data/privacy, and merge/release; close each worktree/branch/issue after the PR is merged. Keep design-system files and generated artifacts under explicit ownership. This is a proposed lightweight branch-and-PR flow, **not an approved Gitflow**.

Before adoption, decide repository host/tracker, branch naming, branch protection, review ownership, CI checks, integration cadence, release branches (if any), how agents receive bounded tasks and avoid file collisions, and who may push/merge/deploy. The installed project instructions require issue → worktree → close for changes once a repository exists, but they do not substitute for these team decisions. Remote operations require explicit user authorization; no remote action was taken in this session.

## Next decisions, in order

1. Project name decided: **TrailSkill**. Pending before public launch: formal SIC trademark search and domain purchase.
2. Define and approve Gitflow plus concrete rules for collaborating programmers and agents.
3. Finish the Superpowers product design and pilot acceptance criteria, including roles/permissions and the school console; obtain approval before implementation.
4. During development, assess FECNA integration, the provided timer source/protocol, offline synchronization, privacy/legal requirements, and projection methods. Do not assume results now.

## Memory and provenance

Engram project resolved as `aplicación para la gestion de deportistas`; a new session-bound save and project-scoped readback succeeded on 2026-10-24. The earlier recovery file documents the memory-server incident and earlier product research. This handoff is a conversation/documentation snapshot, not a backup of Engram or the FECNA data. Continue with `mem_current_project` and project-scoped memory reads in a new session.

Engram resolves the project from the folder name, so sessions started in `~/DEVS/trailskill` resolve to a different project (expected `trailskill`) than the earlier `aplicación para la gestion de deportistas`. In the first session here, run `mem_current_project`, then search the old project explicitly (`project: "aplicación para la gestion de deportistas"`) to recover prior memories, and save new memories under the new project. The TrailSkill naming decision of 2026-10-24 was not saved to Engram (that session was bound to another project); this document is its record.
