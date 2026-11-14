---
name: trailskill-triage
description: "Trigger: before creating an issue or starting work in TrailSkill. Read-only triage: finds an existing issue or pull request, checks architecture and product status, returns one verdict."
license: "TBD"
metadata:
  author: "trailskill"
  version: "1.0"
---

## Activation Contract

Run before creating an issue and before starting work on one. The same skill serves Claude Code, Codex, OpenCode, and Pi. It only reads: it never creates, edits, or comments on issues or pull requests. Creating an issue stays in `trailskill-repo-flow` ("Create an issue").

## Hard Rules

- Read-only. No `gh issue create|edit|comment|close`, no `gh pr create|edit|comment|review`.
- Search open and closed items: always `--state all`.
- A match is the source of truth. Work from it; never recreate it.
- A match that is open and belongs to someone else: stop and tell the maintainer.
- A proposed or open product rule is not a requirement: label it `needs-decision` through the maintainer and stop that part.
- When unsure, ask the maintainer. Do not guess.

## Steps

1. **Search.** Pick 3-5 key terms from the request and run:
   - `gh issue list --state all --search "<terms>" --limit 10`
   - `gh pr list --state all --search "<terms>" --limit 10`
2. **Read matches.** For each plausible match run `gh issue view <n>` or `gh pr view <n>`: definition, acceptance criteria, state, and linked pull requests. Work from it. If it is open and owned by someone else, stop and tell the maintainer. If it is a live duplicate of the request, recommend that the maintainer add the new evidence as a comment (this skill never comments).
3. **Architecture check.** Read `docs/decisions/0003-modular-architecture.md` and `AGENTS.md` for the area touched. Name the owning module, its public `index.ts` entry, and the existing helpers to reuse (`CONTRIBUTING.md`, "Reuse before creating").
4. **Product status.** Find the rule in `PROJECT-HANDOFF-2026-10-24.md` (moving to `docs/product/`). Confirmed: it can be built. Proposed or open: needs a decision, so label `needs-decision` and stop that part.
5. **Report.** Return the verdict and the notes below.

## Output Contract

Verdict, exactly one of:

- `existing issue #N`
- `related issues #A, #B, new issue needed`
- `new issue needed`
- `unclear: ask the maintainer`

Then, in a few lines:

- **Architecture:** owning module, public entry, helpers to reuse.
- **Product status:** confirmed, proposed, or open, with the document section.

## References

- `../../../CONTRIBUTING.md` — Working sequence, Reuse before creating
- `../../../AGENTS.md` — Architecture, Hard limits
- `../../../docs/decisions/0003-modular-architecture.md`
- `../../../PROJECT-HANDOFF-2026-10-24.md`
