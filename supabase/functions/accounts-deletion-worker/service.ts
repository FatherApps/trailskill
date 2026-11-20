import { mailEmail } from './emailTexts.ts';
import type { Clock, Mailer, WorkerStore } from './port.ts';

/** How many requests and emails one run takes; the rest waits for the next run. */
export const BATCH = 50;

// The only messages that may reach the log: the fixed ones of the adapters and the Resend sender. Anything else is logged as "unknown".
const LOGGABLE = /^(Calling [a-z_]+ failed \(\w+\)|Resend (delivery failed \((network|HTTP \d{3})\)|sender is not configured))$/;
const loggable = (error: unknown) => (error instanceof Error && LOGGABLE.test(error.message) ? error.message : 'unknown');

export type RunSummary = { erased: number; stopped: number; skipped: number; sent: { reminder: number; deleted: number; stopped: number }; failed: number };

/**
 * One daily run: erases the accounts whose grace period is over, then sends the emails that are due. The same instant of the clock
 * goes to every database call. A failure on one request or email is counted and logged by kind, and does not stop the others. An
 * email is finished only after it left: an unsent one stays leased in the database and comes back later. Addresses, ids and keys are never logged.
 */
export function createRunWorker({ store, mailer, clock }: { store: WorkerStore; mailer: Mailer; clock: Clock }) {
  return async function runWorker(): Promise<RunSummary> {
    const now = clock.now();
    const summary: RunSummary = { erased: 0, stopped: 0, skipped: 0, sent: { reminder: 0, deleted: 0, stopped: 0 }, failed: 0 };

    for (const id of await store.listDue(now, BATCH)) {
      try {
        const status = await store.erase(id, now);
        if (status === 'deleted') summary.erased++;
        else summary[status]++;
      } catch (error) {
        summary.failed++;
        console.error(`accounts-deletion-worker erase failed: ${loggable(error)}`);
      }
    }

    for (const mail of await store.claimMail(now, BATCH)) {
      try {
        // A mailer that sent nothing (the test mailer) did not deliver: the email stays unfinished.
        if (!(await mailer.send({ to: mail.email, ...mailEmail(mail), idempotencyKey: `account-deletion-${mail.kind}/${mail.requestId}` }))) {
          summary.failed++;
          continue;
        }
        await store.finishMail(mail.requestId, mail.kind);
        summary.sent[mail.kind]++;
      } catch (error) {
        summary.failed++;
        console.error(`accounts-deletion-worker ${mail.kind} email failed: ${loggable(error)}`);
      }
    }
    return summary;
  };
}
