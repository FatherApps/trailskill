# Rules of «Mis tiempos»

- Status: the six rules below are **confirmed** by Mario on 2026-11-15 (relayed by the maintainer in the comment on #1017).
- Issue: #1017.
- «Mis tiempos» is the family stopwatch module (`family-timing`): a guardian or an adult athlete times their own swimmers on the phone.

How to read this page: each rule lists the **details stated** in the implementation issues, which record the plan "Mis tiempos con series, compartir y sincronización" (section "Decisiones tomadas", numbered decisions) approved in the 2026-11-14 meeting. Anything those issues do not say is listed as **open**: do not implement it and do not infer it. Mario's own words for these rules were not available when this page was written; if his text differs from the stated details, his text wins and this page is corrected.

## 1. Laps (parciales)

Status: **confirmed**.

Stated details (decisions 6 and 7, #969):

- The pool (25 m or 50 m) is required; without it the stopwatch does not start.
- The number of laps is the distance divided by the pool length, so 100 m in a 25 m pool is 4 laps and the stopwatch stops by itself on the fourth.
- The start key starts the stopwatch and the lap key marks each lap. The last lap is closed with either key.
- Every line shows the lap and the running total, for example `Lap 2 · 0:18,40 · total 0:35,12`.
- Series mode (several swimmers, one start): the lap key does nothing (decision 8, #971).

Open:

- The lap-count function needs Mario's approval before it moves to `src/core/sport/` (noted in #969).
- Distances that are not a multiple of the pool length.

## 2. Recoverable delete

Status: **confirmed**.

Stated details (decision 5, #967 and #968):

- Deleting a time hides it for 30 days. It can be recovered from the «Eliminados» screen. After that the server deletes it.
- Deleting asks for confirmation.
- A time already sent to another account cannot be deleted by whoever sent it.

Open:

- Whether the 30 days count from the moment of the deletion or from another event.
- What the guardian sees when the 30 days end while the phone is offline.

## 3. The swimmer's code as consent

Status: **confirmed**.

Stated details (decisions 1, 2 and 4, #972):

- Each swimmer has their own short code, for example `TS-7K4Q2M`. It is visible in the swimmer's profile, copyable and revocable.
- Revoking the code makes the previous one stop working.
- A lookup returns only the short name (for example «Ana M.») and nothing else about the swimmer, and the number of attempts is limited.
- Sharing the code and accepting the request is the consent. The Google Play data-safety form and listing are updated accordingly.

Open:

- The exact attempt limit and the lockout time are implementation values, not a rule Mario gave. They are tracked in #972 and #1013.
- Who may revoke the code: any guardian of the swimmer or only one of them.

## 4. Sending a time to another family

Status: **confirmed**.

Stated details (decision 3, #973; relation with decision 5, #968):

- From a time (individual or series), a guardian chooses "another swimmer" with the swimmer's code. This creates a request to that swimmer's guardian (guardian 1; the sender is guardian 2).
- On acceptance the time moves to guardian 1 and disappears from guardian 2, in a single server transaction.
- If guardian 1 rejects it, or does not answer in 30 days, the time returns to guardian 2 as "sin asignar". Guardian 2 may withdraw the request before that.
- A time already sent cannot be deleted by the sender (see rule 2).

Open:

- Whether guardian 1 is notified of a pending request, and how.
- What happens when a swimmer has several guardians: who answers the request.

## 5. Choosing the official result

Status: **confirmed**.

Stated details (decision 15, #974; builds on #944):

- A competition record or a series record can get its official time added by hand; the captured time is always kept.
- When official results are imported: if only one candidate matches, it is associated automatically; with several candidates, the app asks which one goes with each time. Each official result is used once.
- Two times and two official results for the same event and day make the app ask for the association.

Open:

- The tie-break rule when the guardian skips the question.
- Whether the day is fixed when the time is captured or follows the phone's time zone (open question in #944).

## 6. The best time counts typed official times

Status: **confirmed**.

Stated details (#970; the official/captured relation also in #941):

- The best time of each event is highlighted in the list.
- When an event has an official time, that time counts as the record and the captured time stays visible. This includes official times typed by hand.
- Filters: type (training and competition, training only, competition only), style, distance, and pool.

Open:

- Which of two official times counts when a typed one and an imported one exist for the same event and day.
- Whether the personal best of the athlete profile (`athletes`) follows this same rule; its own rule is tracked in #204.
