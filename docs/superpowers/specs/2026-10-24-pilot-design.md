# TrailSkill pilot design

Date: 2026-10-24 · Status: **draft for maintainer approval** · Issue: #9

This document defines what the TrailSkill pilot does and the rules it follows. It is the behavior contract for the implementation plan. It does not define the look of the app (that is the design system, see [`design/README.md`](../../../design/README.md)) or the technical architecture (decided later as ADRs in `docs/decisions/`).

Markers used below:

- **Decided** — the maintainer decided it. Treat it as a requirement.
- **My call** — chosen by the author of this document to fill a gap. The maintainer reviews these; a builder may revisit them only through the maintainer.
- **Open** — not decided. Do not implement a guess; ask the maintainer (label the issue `needs-decision`).

## 1. Intent

TrailSkill is a modular athlete-development platform for several schools and, later, several sports. The pilot starts with swimming in Colombia, with La Academia (Liga Atlántico) as the pilot school. La Academia is the pilot, not the brand.

The pilot exists to prove that a school can stop recording training times on paper or ad hoc tools and instead:

- time and record training work at the pool, fast and without depending on the network;
- give each family and adult athlete a trustworthy, private view of results, history and progress;
- give the school a console of its athletes, coaches and records.

Sources: `PROJECT-HANDOFF-2026-10-24.md`, the design system linked in `design/README.md`, and the maintainer's answers on 2026-10-24.

## 2. Pilot success (Decided)

The maintainer considers the pilot successful when the app can:

1. Show the results of each registered swimmer.
2. Show the swimmers that belong to a school.
3. Show a swimmer's historical records and trends. Future projections are reserved: the space exists, the method does not (see section 10).
4. Keep recording periodic training-time measurements to show progress.
5. Be downloaded from Google Play, with registration by a guardian for a minor or directly by an adult.
6. Offer a school console for its swimmers and their data, coach registration, and records by category.
7. Use the separate time-capture button, assigning captured times to swimmers by stroke and distance.

Section 11 turns each outcome into acceptance criteria.

## 3. Goals, non-goals, anti-goals

**Goals**

- Timing at the pool that a coach can operate one-handed, wet, while watching the swimmers.
- Local-first behavior: every action of the coach is saved on the device instantly and synced later.
- Trustworthy records: every value shows its origin, author, time and sync state.
- Privacy of minors' data by default, with explicit authorization per purpose.

**Non-goals for the pilot** (Decided, from the handoff and the design system)

- Social features, wearables, video analysis, AI or LLM features, nutrition or psychology content.
- A projection model.
- A separate web application.
- Export of data from the console.
- Accounts for minors.

**Anti-goals** (what would make the pilot a failure even if it technically works)

- The app freezes, blocks or loses data when the pool has no signal.
- A coach needs menus, dropdowns or typing while a series is running.
- A missing time is shown or stored as zero.
- Any person sees data of a minor that they are not authorized to see.
- Real personal data appears in tests, screenshots, issues or logs.

## 4. Constraints (Decided)

- **One app, one repository.** A single React Native + Expo app serves every role: guardians and adult athletes on phones, school administrators and coaches on tablets. Not a monorepo until a second deployable appears (`AGENTS.md`, Project organization).
- **Android first, iOS from the same code.** Android-only APIs live only in isolated native modules.
- **Google Play.** Every build targets Android 16 (API 36) or higher. The developer account is personal, so production requires a closed test with at least 12 testers for 14 consecutive days; the La Academia pilot runs on that closed track (`docs/RELEASING.md`).
- **Design.** All visual decisions come from the design system (`design/README.md`). This document references its components and screens by name and never restates colors or sizes.
- **Language of artifacts.** Code and docs in English; UI copy in translation keys (see Open decisions for the UI language).

## 5. People, roles and relationships

### 5.1 Concepts (Decided)

- **User account** and **athlete profile** are separate concepts.
- A **guardian** (adult) account manages one or more minor athlete profiles. Minors have no login.
- An **adult athlete** registers and manages their own profile.
- An athlete may belong to several **schools** and work with several **coaches**. A school has several athletes and coaches.
- A **training group** organizes collective plans inside a school. It is not necessarily a federation **category**.
- A **platform administrator** resolves conflicting corrections with an audited decision.

### 5.2 Permissions (Decided)

The permission table in the design system (section "States, permissions and sync") is the reference. Key rules:

- Coaches record and edit measurements only for their assigned athletes with a valid authorization. Every edit keeps author, device and history.
- Guardians and adult athletes cannot edit measurements; they can report an error.
- School administrators see their whole school, invite coaches and guardians, and authorize sharing their school's results with another school.
- Results from another school are visible only with that school administrator's authorization and only online.
- ID numbers and birth dates are never shown in lists or the console.
- Permissions are enforced by the backend. Hiding a screen is never the only protection.

### 5.3 Coach assignment (My call)

- The school administrator assigns coaches to training groups. A coach's **assigned athletes** are the athletes of their groups plus any athlete the administrator assigns to them individually.
- A coach's device downloads, for offline use, only their assigned athletes and the plans of their groups.
- Removing a coach from a group stops new recordings for those athletes; the coach's earlier records keep their author.

## 6. Behavior by area

### 6.1 Registration and authorization (Decided, from the design system)

1. "¿Quién va a nadar?": a child (guardian flow) or "Yo" (adult flow).
2. Account details with phone or email verification by code.
3. Guardian flow: one or more athlete profiles (name, surname, category, training group).
4. Authorization per athlete and per purpose, never pre-checked: recording times and results; FECNA import; sharing results with another school. One acceptance never implies another.
5. Evidence kept for each authorization: accepted full text and version, adult identity and validated representation, athlete, purposes, time and acceptance event. Authorizations can be withdrawn.
6. A draft is saved on the device at each step, so a lost signal never loses typed data. Verifying the code and creating the account need signal.
7. A school invitation link pre-fills school and group.
8. Registration never depends on FECNA.

Athletes without a valid authorization appear in the coach's lists marked "se omitirá" and are skipped by timing.

**Authorization while offline (My call).** The coach's device keeps the last authorization state it synced for each assigned athlete and allows recording when that state is valid. If a withdrawal arrives at sync, recordings made after the withdrawal are kept on the server but hidden from everyone except the guardian and the platform administrator until counsel defines retention. Recordings made before the withdrawal stay as they are.

### 6.2 Timing (Decided)

Timing has three modes. All of them save to the device first.

**a) Individual on-screen stopwatch.** Start, Split and Stop on the screen, then Save or Discard with the difference against the personal best, then automatic advance to the next athlete.

**b) Series with a single button.** Used when several swimmers start together. Swimmers choose their own lane, so lanes are not recorded.

1. The coach chooses stroke, distance, pool, type (training or competition) and the swimmers in the water.
2. One shared start.
3. Each press of the single button (on screen, or the physical external button) records an **arrival** in order: 1st, 2nd, 3rd… with its time. No names are needed while timing. "Deshacer última" removes the last arrival.
4. **After the series**, the positions are listed with their times and the next unassigned position is highlighted. The swimmers in the water appear as large name cards; tapping a card assigns it to the highlighted position and moves on. Tapping a position reopens it. No dropdowns.
5. An arrival left without a name is saved as "por asignar" and is never dropped.
6. The stopwatch is immediately ready for the next series.

**c) Completed without time.** For work that only records completion: a "Completado" toggle per athlete.

**Timing rules**

- Times are computed from monotonic timestamps taken at the press event, never from an accumulated timer.
- Missing time is null, never zero. "Completado" (done, no time) and "—" (not recorded) are different values.
- Repetitions, series totals, continuous race times and splits are distinct kinds of value.
- The app shows hundredths, never milliseconds, until precision is validated (section 10).
- The screen stays awake while timing; the back gesture while running asks for confirmation.
- Several coaches may time the same session on different devices; every result keeps its author and device.

**External button (Decided intent, integration Open).** The Kotlin prototype (`cronometro-natacion-fase3`, outside this repository) is a reference only. Its pure logic (stopwatch state machine, splits, arrival assignment) is rewritten in TypeScript with tests. Only button capture with a native timestamp becomes a small Expo native module that emits "button pressed at monotonic time T". The prototype's USB headset sends Android volume keys, which only work on Android. If the button disconnects, the app offers the on-screen button and nothing is lost.

**Release path (My call).** The on-screen single button is the release path for the pilot. The physical button joins when its hardware and precision are validated on Android; until then its native module is built behind the same "arrival at time T" interface, so the timing flow does not change when it arrives.

### 6.3 Planned trainings (Decided, from the maintainer and the design system)

- A **plan** is an ordered list of **blocks**. A block is repetitions × distance × stroke (or drill) with optional equipment (fins, paddles, snorkel, kickboard, pull buoy), an optional send-off interval, a phase (warm-up, main, technique, cool-down) and **what gets recorded**: completion only, a time per repetition, or the series total.
- Plans can be saved as **templates**.
- A plan is **assigned** to one athlete, a training group or category, or the whole school, for a date.
- **Fulfillment** (coach, tablet): a grid of athletes × blocks. Each cell is Done, Partial (with count), Didn't attend or Not marked. Timed blocks open the series timer and show progress ("8/8 tiempos").
- **Today** (guardian and adult athlete, phone): the day's plan, equipment to bring, each block's status and recorded times, and "Avisar algo al entrenador" to report or comment.
- Guardians report from the athlete profile; coaches manage the records of their assigned athletes. Every change keeps its author; several coaches can mark from different devices.

**Versioning (Decided).** Editing a plan that is already assigned creates a new version. Everything already recorded is kept and stays tied to the version it was recorded against.

- **My call:** the new version applies to sessions that have no records yet; a session that already has records keeps its version, so one day never mixes blocks of two versions.
- **My call:** the Today view shows a short notice when the plan changed.
- **My call:** each version keeps its author and date.

### 6.4 Athlete profile, history and trends (Decided, from the design system)

- Header with short name, category, school, authorization state and "Actualizado hace N min"; a school selector when the athlete belongs to several schools.
- Event selector (stroke, distance, pool) and the highlighted personal best with its improvement, type and date.
- Progress chart with the reserved projection zone left empty.
- History with type, source and sync state on every record; repetition, series-total, race and split values labelled distinctly.
- Every record shows its origin: training, competition, FECNA, external button, another school.

### 6.5 School console (Decided: same app on a tablet)

- **Athletes:** indicators (active, authorization pending, measurements this week, needs review), search, filters (category, training group, coach), table and detail.
- **Coaches:** list, invite, deactivate.
- **Records by category**, with a pool filter: best mark per event, athlete and date.
- **Measurements:** chronological log with filters; conflicts are flagged here and resolved by the platform administrator.
- **Authorizations:** status per athlete and purpose; re-send a request; approve sharing with another school.
- Shows full name, category, group, guardian and contact. Never ID numbers or birth dates.
- **Categories (My call):** each school keeps its own category list, seeded with the federation's categories and editable by the school administrator. Athletes are placed in a category by the administrator or at registration; the category is never derived from the birth date, so it never changes silently.

### 6.6 FECNA history import (Decided: optional, initial scope)

- Optional, started by the guardian or adult athlete (the school can suggest it), for one swimmer at a time. No bulk collection, no unrelated athletes.
- The guardian confirms the matched history ("¿Es esta persona?") before import, even when club or league reflect an earlier affiliation. The source's ID number and birth date are never displayed.
- The guardian chooses which results to import; duplicates are skipped.
- Imported results carry a FECNA tag and their provenance, cannot be edited in the app, and are never silently overwritten. A manual refresh imports only new results.
- Registration and the rest of the app work when FECNA is unavailable or has no record.
- **Open:** how the data is obtained (API, permission, retrieval) and the identity-matching rule. The handoff defers this research to development.
- **Delivery (My call):** FECNA import is built last in the pilot (section 13), after its research confirms a permitted way to obtain the data. If the research does not confirm one, the pilot ships without it and the maintainer is told.

## 7. Local-first data and sync (Decided)

- The local database on the device is the app's read source. Every write (time, assignment, fulfillment, registration draft) is saved locally first and the screen never waits for the network.
- Writes go into an **outbox** with client-generated IDs, so retries are idempotent. A background process sends the outbox when there is signal, retries with backoff, and syncs on app foreground.
- Each record shows its real state: *En el teléfono* → *Enviando* → *Enviado*; *No enviado* with "Intentar de nuevo" after repeated failures; *Revisar* when edits conflict.
- **Conflicts:** both versions are kept with author, device and time until the platform administrator decides; the decision is audited.
- **What a conflict is (My call).** New measurements are append-only: two coaches timing the same series on two devices produce two separate sets of records, never a conflict. A conflict is two different edits of the **same existing record** made on different devices without seeing each other. A guardian's error report is a note on the record, not an edit.
- **Resolving conflicts (My call).** The pilot includes a minimal "Revisar conflictos" screen in the same app, visible only to the platform administrator role: both versions side by side, choose one or enter the correct value, with a reason. The school console only flags conflicts.
- **Local data is never lost.** Closing the app, a dead battery or signing out with pending records triggers a warning first; the outbox survives a force-quit and a restart.
- Own-school authorized data is fully usable offline, including recording. Another school's results are online-only and never cached.
- Most logic runs on the device; the server syncs, backs up, shares and enforces permissions.
- **Open (technical, builder decides with an ADR):** backend, hosting and the sync technology. Constraint for that choice: it must support this local-first model, idempotent outbox writes, conflict detection with full history, and server-side permissions.

## 8. Privacy and consent (Decided)

- Minimum data: name, surname, category or group. Birth date and ID are collected only if legally required, stored separately, and never shown in full.
- Poolside screens show only the short name ("Lucía R."). Lock-screen notifications never show times or full names.
- Authorization per purpose with retained evidence (section 6.1).
- FECNA import, school-to-school sharing and any future AI processing each need their own authorization.
- Only synthetic data in tests, fixtures, seeds, screenshots, issues and pull requests.
- **Open:** data controller, representation validation, retention, and legal copy, to be validated by counsel under Colombian Law 1581 of 2012.

## 9. Content and accessibility (Decided, from the design system)

- Voice, fixed terms (acudiente, nadador, marca personal, medición, toma de tiempos) and copy rules follow the design system.
- Accessibility follows the design system's rules (WCAG 2.2 AA floor, large timing targets, TalkBack first, 200% font size).
- Every UI string is a translation key.

## 10. Open decisions

Do not implement a guess for any of these.

| Topic | What is open | Who decides |
| --- | --- | --- |
| UI language | Spanish (es-CO) only, or Spanish and English | Maintainer, before final pilot copy |
| Decimal separator in times | Comma (33,91) or point (33.91) | Maintainer with La Academia coaches; one configurable formatter in the meantime |
| Backend, hosting, sync technology | Product and architecture, including whether data may be stored outside Colombia, the hosting budget, and the SMS or email provider for verification codes | Builder proposes an ADR with these questions; maintainer approves |
| External button | Hardware for iOS, protocol, precision | Research track; results count as official only after validation |
| Stopwatch precision | Validation against a reference timer | Before showing hundredths as reliable |
| FECNA | Data access and identity-matching rule | During development |
| Legal | Controller, representation validation, retention, legal copy | Counsel |
| Projections | Definition, method, confidence, presentation | Later research; the zone stays empty |
| Teen access | No account in the pilot (Decided); later options open | Maintainer, after the pilot |

## 11. Pilot acceptance criteria

Each criterion is checked on a release build from the Google Play closed track, with synthetic data unless La Academia's real pilot data is explicitly authorized.

1. **Results per swimmer.** A guardian sees each of their athletes' results with type, source, date and sync state; an adult athlete sees their own. A coach sees only assigned athletes.
2. **Swimmers of a school.** A school administrator lists all athletes of the school, filters by category, group and coach, and opens an athlete's detail.
3. **History and trends.** An athlete's profile shows history per event, the personal best with its improvement, and a progress chart with an empty, labelled projection zone.
4. **Periodic training measurements.** A coach runs a series with the single on-screen button in airplane mode: arrivals are recorded in order, names are assigned with cards after the series, and all results reach the server, with author and device, when the connection returns. A force-quit during the session loses nothing.
5. **Google Play and registration.** The app installs from the closed track. A guardian registers a minor with per-purpose authorization; an adult registers themselves. Losing the signal mid-registration keeps the draft, and registration completes once code verification succeeds.
6. **School console.** On a tablet, the administrator invites a coach, sees records by category, and sees authorization status per athlete.
7. **External button.** Presses of the physical button are recorded as arrivals with the same flow as the on-screen button, and assigned to swimmers by stroke and distance. Until its precision is validated, its results are labelled with their source. (Checked once the button is validated; see section 6.2, Release path.)
8. **Planned trainings.** A coach builds a plan from blocks, assigns it to a group, marks fulfillment in the grid, and edits the plan afterwards: a new version is created and earlier records keep their version.
9. **Missing time.** Nowhere in the app, the server or exports of the database is a missing time stored or shown as zero.
10. **Privacy.** No list or console screen shows an ID number or birth date; another school's results are not visible without authorization or offline.

## 12. Delivery order (My call)

Each step is a group of issues that can reach the closed track on its own:

1. Foundations: app shell, design-system theme, local database, outbox and sync, roles and permissions.
2. Registration and authorization (guardian and adult).
3. Timing: individual stopwatch, single-button series with name-card assignment, completed without time.
4. Athlete profile, history and trends.
5. School console on tablets, including coaches and records by category.
6. Planned trainings: blocks, templates, assignment, fulfillment, versioning, Today view.
7. External button native module (after hardware validation).
8. FECNA import (after its research).

Criterion 4 of section 11 needs steps 1 to 3; the closed test can start as soon as they reach the closed track.

## 13. Left to the builder

- Architecture, backend and sync technology (through an ADR, respecting section 7).
- Local database and state management, folder layout by feature, testing setup and CI for the app.
- How to split this design into issues and pull requests, following `CONTRIBUTING.md`.
- Component implementation from the design system's component guidelines.
