# Engram recovery and product-discovery handoff

Date: 2026-10-24 (America/Bogota)
Status: HTTP service recovered; Codex session restart and memory-write verification pending.

## Immediate next action

Start a new Codex session in this workspace. Read this file before resuming. Resolve the workspace through mem_current_project; do not guess a project or session ID. Let the native lifecycle register the authoritative session. Verify one legitimate memory save and a project-scoped readback before claiming persistent memory is repaired. Then persist this handoff and resume product discovery.

## Repair evidence

- Installed CLI: /opt/homebrew/bin/engram, version 3.5.2.
- Original HTTP server on localhost port 7437 used the old 1.20.0 executable. Its health response reported version 0.1.0, without runtime-session capability. This caused every session-bound memory write to be rejected.
- The assistant could inspect processes using targeted elevated lsof calls, but macOS rejected graceful process termination. No forced termination was attempted.
- The user manually stopped processes holding the database. A new server subsequently appeared and its health response reported version 3.5.2, instance_id and runtime_session_resolution:true.
- Normal MCP reads now report Transport closed; a write is blocked with: Codex host session is not registered; start a new Codex session to register it.
- One old 1.20.0 client was still observed after the user's stop command. It was not the HTTP listener. Verify whether it remains before undertaking any maintenance.
- No assistant-performed database migration, store promotion, backup, binary upgrade, security bypass or configuration change occurred. This document is a conversation handoff, NOT a backup of the memory database.
- Do not retry old-session writes, invent a session ID or bypass the lifecycle using manual CLI saves. Do not remove SQLite sidecars.
- Current workspace canonical project previously resolved as: aplicación para la gestion de deportistas. Re-resolve in the new session before using it.

## Goal and development constraints

Design a phased modular athlete-development platform, initially for swimming in Colombia. The pilot school is La Academia, Liga Atlántico. Reference athletes are boys and girls aged 10–12; broader ages up to 21 were discussed tentatively. The development team uses AI-assisted coding and prioritizes a fast, simple MVP. Technical artifacts default to English; direct conversation is Spanish. No product implementation has begun. Do not create code, scaffold, install dependencies or treat the full design as approved.

## Confirmed decisions

- React Native + Expo for the mobile application; Android first, future iOS considered from the start. A Google Play developer account already exists. No backend, hosting or synchronization product has been selected.
- Adult guardian accounts manage minor athlete profiles. The MVP does not give children independent login accounts. Athlete profiles and user accounts are different concepts.
- Athletes may belong to multiple schools and coaches. Schools have multiple coaches and athletes. Training groups organize collective plans; a training group is not necessarily the same as a federation category.
- Coaches can assign plans to an athlete, group/category within a school, or school. Exercises include repetitions, distances, strokes and equipment such as fins, paddles and snorkels.
- Fulfillment and comments are tracked per athlete. The guardian can report from the athlete profile; the coach can manage the assigned team's individual fulfillment and comments.
- Timing is optional: some work only records completion. Other work records repetition times, overall event times or distance splits. Distinguish repetitions from splits and an exercise-series total from a continuous race time. Missing time is not zero.
- Own-school authorized data must remain usable offline, including recording. Multiple coaches can edit the same session from different devices. Preserve author and change history; conflicting corrections are resolved by a platform administrator with an auditable decision.
- Cross-school viewing requires authorization from the source school's administrator. In the MVP, shared external-school results are viewed online only. Do not infer permission to share nutrition, psychology or all other records.
- Include personal-data processing authorization with retained evidence: accepted full text/version, adult identity and validated representation, athlete, purposes, time and acceptance event. Importing FECNA results, sharing between schools and processing through LLMs must not be inferred from a blanket acceptance. Legal/controller/retention details still require validation.
- Nutrition and psychology professionals are available to validate ideas and published educational content. Personalized LLM features remain later-phase proposals.

## FECNA research

The user wants an optional authorized import of a swimmer's existing official results at registration, followed by a manual refresh option. Do not scrape national datasets or collect unrelated athletes. Registration must remain possible if FECNA is unavailable or the swimmer has no published record. Any import connector remains unimplemented and technically unproven.

- Public ranking: https://ecoapplet.co/fecna/reportes/index
- Public individual history: https://ecoapplet.co/fecna/reportes/historial
- Ranking fields verified: date range, competition, gender, athlete type, multiple categories, league, club, event and pool. Screenshots show LC50/SC25 and individual freestyle, backstroke, breaststroke, butterfly and medley events.
- Individual-history fields verified: date range, swimmer selector, event and best-time-per-year grouping. Identification-number lookup is user-reported but not independently verified. No real swimmer ID was submitted.
- Export controls CSV/Excel are visible in screenshots. The supplied CSV was inspected read-only: /Users/maser/Downloads/Ranking FECNA.csv. It has 5 rows, 5 swimmer labels and 9 columns: Ranking, Prueba, Nadador, Categoría (Año-mes), Tiempo, Puntos World Aquatics, Fecha Torneo, Liga, Club. It has no ID or pool column. Do not reproduce names or infer a complete individual history from it.
- National comparison means all clubs/leagues under comparable event/category/gender/pool/period filters. A club-filtered ranking is not national.
- No supported public API, automation permission, complete history retrieval or matching mechanism has been established. Preserve provenance; avoid duplicate results and silent source corrections.

## Timing prototype and product references

Another programmer is testing a button-controlled Kotlin swimming timer and will share the source. Screenshots show setup, device/key testing and timing-related screens, but no verified protocol, code quality or accuracy. Keep this as a separate research track. Expo Kotlin modules are a possible integration route, not a proven integration. Android-specific input handling will need separate iOS evaluation. Millisecond display does not prove millisecond accuracy.

The user approves using competitor apps as selective inspiration, not automatic scope additions. Primary-source research found useful patterns in Swim.com (logging/progress), MySwimPro (structured editable workouts), GoSwim.tv (technique content/groups) and Swim Coach Plus HD (video analysis reference). SwimIO/Speedo Fit and Swim4Gold current availability were not verified. Swim England's JustSwim is officially unsupported; com.spiraledge.swimapp belongs to Swim.com. Do not infer competitor implementation stacks or repeat old prices as current.

## Open decisions after memory verification

Consolidate and obtain approval of the complete design, including exact MVP scope and acceptance criteria; choose backend and durable offline-sync approach; define guardian representation verification, controller and data lifecycle; define plan/version/assignment semantics, conflict workflow and permissions. Maintain a shared architecture and small reviewed work units for team collaboration. Do not expand MVP automatically to social networks, wearable integration, video analysis, Bluetooth timing or LLMs.
