# Swimmer data lifecycle

- Status: **confirmed** by Mario on 2026-11-22.
- Issue: #1415 (documents and authorization texts v2). The code that enforces these rules lives in the other issues of the same batch (#1416 to #1423); this note changes no permission and no sync rule.
- Legal review of the texts is still pending (#106). Every legal document that follows from this note stays marked «PENDIENTE de revisión legal».
- Where a rule below is **derived**, it was worked out from Mario's words by the team and is not a quotation. Only what is quoted is Mario's own.

## 1. The rule

Mario's words (2026-11-22, kept as written, with his spelling):

> «El nadador puede inscribirse independiente, 2 La escuela puede inscribirlo en la escuela 3.La escuela puede darlo de alta aunque el nadador no se halla dado de alta en la app antes. Si el nadador se da de baja de la escuela, la escuela puede ver los datos por 30 dias pero el nadador queda libre para ir a otra escuela, si otra escuela lo acoje la escuela inicial deja de ver sus datos y los datos se transfieren a la otra escuela. el nadador siempre es el dueno de sus datos. La escuela puede hacer una copia de los datos pero quedaria como nadador anonimo con el codigo del nadador. Ahora es necesario poder tener un codigo unico de nadador.»

## 2. What it means

1. **Three ways in.** A swimmer enrolls on their own (independent use), a school enrolls the swimmer, or a school registers the swimmer even though nobody has signed up in the app yet.
2. **The family owns the data.** The swimmer (through the guardian who manages them, or the adult swimmer) is always the owner of their data. A school is not.
3. **Leaving a school.** When the swimmer leaves (la baja), the school keeps reading the swimmer's data for **30 days**. The swimmer is free to join another school meanwhile. *In `main` with #1418: the school reads, read-only, until the window ends.*
4. **Joining another school.** If another school takes the swimmer in, the first school stops reading the data at that moment and the data moves to the new school. The 30 days are a limit, not a right to read until they end. In `main` (#1419): the move happens with the family's acceptance, and the new school then reads the marks of the previous schools whose link has **ended**. While the swimmer is active in two schools, each school sees only its own marks. The owner can also open a swimmer's marks of other schools to one school (#1446); withdrawing that grant, or ending a link, stops it.
5. **The school's own copy.** The school may keep a copy of the data, but as an **anonymous swimmer** that carries only the swimmer's code (paraphrasing Mario; his words are «con el codigo del nadador»): no name, no document, no way to tell who it is from the copy alone. Legally it is **pseudonymization, not anonymization** (#1420; the note on #106): whoever holds the permanent code or a recovery code can claim the copy. Derived: the copy carries the technical key of that copy (`former_athlete_key`), not the public share code of [`my-times-rules.md`](my-times-rules.md) and not the permanent code of section 3 in clear.
6. **A permanent code per swimmer.** Each swimmer needs a unique code.

### Roles (derived)

Derived from items 2 and 3, and the basis of the privacy policy and the transmission contract:

- The **family** owns the data.
- The **school** is the data controller (Responsable) of what it collects while the swimmer is enrolled and for 30 days after the baja. Swimcro is the school's processor (Encargado) under a transmission contract (Decreto 1377 de 2013, art. 25; template in [`docs/release/transmission-contract.es.md`](../release/transmission-contract.es.md)).
- **Swimcro** is the controller (Responsable) of independent use: registration without a school, «Mis tiempos» and the times sent between families.

## 3. The permanent code

Mario's words on the code (2026-11-22):

> «ese codigo es unico y no debe publicarse»

> «solo lo puede ver el dueno del dato en caso que necesite recuperar una informacion o desee recuperar datos en una escuela»

> «nosotros tampoco lo conocemos se cifra como un token»

Derived rule: the server keeps only a one-way hash of the permanent code. The plain text is held only by the owner of the data (the guardian who manages the swimmer, or the adult swimmer), on that user's phone. The share code of [`my-times-rules.md`](my-times-rules.md) (rule 3) is a different thing: it stays the public, revocable code used to send times between families.

## 4. Losing the code

Mario's words:

> «No se recupera pero el dia que se genera se pueden obtener codigos de recuperacion es posible?»

Derived rules, which answer his question:

1. When the code is generated, **recovery codes** are generated with it: single use, 8 by default, like the backup codes of two-factor authentication.
2. The code and every recovery code are shown **once** to the owner. The server keeps only their hashes.
3. A recovery code works as an alternate key. It is consumed when it is used.
4. After using one, the owner may generate a new set. The new set invalidates the unused codes of the old one.
5. If the code and every recovery code are lost, **nothing can be recovered**.

## 5. Rules settled after the issue was written (derived)

These come from the maintainer's decisions of 2026-11-22 for the code issues of the batch. They are derived from Mario's words, not quoted, and the rest of this note does not contradict them.

1. **The recovery identity survives erasure.** Erasing an account or a swimmer does not delete the recovery identity. Only hashes stay, linked to the school's anonymous copy (`former_athlete_key`). The family can still claim that copy later with its code.
2. **A recovery set can be re-issued until the owner confirms saving it.** While the owner has not confirmed that they saved the set, it can be issued again. After the confirmation, a lost set is lost (section 4, item 5).
3. **A school registers a swimmer without an account** by attesting that it holds the guardian's signed authorization from enrollment. The profile stays under the school until a family claims it with a link. Active staff of that school (an administrator or a coach) cannot claim it.
4. **After the baja, 30 days of reading, then a daily job closes it.** The school reads for 30 days; a daily job closes that reading when the window ends.

## 6. What this changes in the texts

- The privacy policy, the Play Data safety draft and the Play listing say the roles above and a **18+** target audience (the users are adults who manage swimmers' data).
- Version 2 of the authorization texts of the four existing purposes names the school as controller with generic wording («la escuela en la que inscribes al nadador»). Version 1 rows never change.
- Three new purposes are planned: the school reading for 30 days after the baja (`school_read_after_end`), the transfer of the data to a new school (`school_transfer`) and the school's anonymous copy (`school_anonymous_copy`). They are **not in the database yet**: the app lists the latest text of every purpose, and builds already in the field have no title for a new one, so they are inserted with the issue that shows them, together with their translation keys. Their draft wording is in the body of the pull request of #1415.
- The app does not ask for the new acceptance yet; that is a later issue. A family that accepted version 1 still shows as accepted: the app decides by athlete and purpose, not by version.

## 7. Open

- Who acts as legal entity for Swimcro (**PENDIENTE de revisión legal**, #106). The documents carry placeholders; nothing invents it.
- The legal review of the transmission contract template.
