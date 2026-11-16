# Which school times a guardian sees

- Status: **confirmed** by Mario (rule and the five decisions below), relayed through the planner.
- Issue: #1017. It replaces the original scope of #975 and is the source of truth for the backend issue (#1018) and the school console issue (#1019).

## The rule, as Mario said it

> «no necesariamente un entrenador o escuela puede compartir toda la info de un niño con el padre. Esto sería discrecional de la escuela o el nadador. Esto porque seguramente muchos entrenadores o escuelas [no] necesariamente quieren entregar toda la información.»

The quote is kept word for word, including the `[no]`. Do not correct or summarize it.

## Confirmed decisions

All five are **confirmed**.

1. **Default for new swimmers.** The school's default for a new swimmer is "do not share".
2. **Who changes it.** A coach or a school administrator changes it per swimmer, for each (swimmer, school) pair.
3. **Switch off means record by record.** While sharing is off for the pair, coach or administrator shares record by record.
4. **Earlier rows stay visible.** Rows captured before the release that introduces this rule stay visible to the guardian.
5. **Adult athletes.** An adult athlete always sees their own times.

## Scope

The rule applies only to **school times**: rows of `public.measurements` with a `school_id`.

The guardian always keeps:

- the times from the family stopwatch («Mis tiempos»);
- the imported official results;
- the assigned training plans and their fulfillment;
- the authorizations;
- the rows hidden after an authorization is withdrawn (#54).

Staff visibility does not change: coaches and school administrators keep seeing the full history.

## Decisions 9 to 11 of the #975 meeting

| # | Original decision | Status now |
| --- | --- | --- |
| 9 | A per-swimmer switch "share all times with the guardian" | Reworded by the confirmed rule: the switch is per (swimmer, school) pair and the school sets the default. |
| 10 | The switch is off at the start for everyone | Reworded by the confirmed rule: the default is the school's default for new swimmers, which is "do not share". |
| 11 | School times from before the update stay visible; only new ones wait | **Confirmed** as it was. |

## Out of scope here

Code, migrations, and screens (they go in #1018, #1019 and #1020), the legal review (#106), and moving the rest of the handoff into this folder.
