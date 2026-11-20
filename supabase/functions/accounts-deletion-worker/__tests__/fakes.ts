import type { Email } from '../../accounts-delete-account/port.ts';
import type { Clock, DueMail, EraseStatus, MailKind, Mailer, WorkerStore } from '../port.ts';

export const LEASE_MS = 15 * 60 * 1000;
export const KEY = 'FORMER-ATHLETE-KEY-ABC123';

/** A clock the test moves by hand. */
export function createFakeClock(start = '2026-12-01T12:00:00.000Z') {
  let current = new Date(start);
  const clock: Clock = { now: () => new Date(current) };
  return { clock, advance: (ms: number) => void (current = new Date(current.getTime() + ms)) };
}

type Row = DueMail & { leasedUntil: number; finished: boolean };

/**
 * An in-memory store with the database semantics the worker relies on: a due request is erased once, an email is leased for 15
 * minutes when claimed and never returned again once finished. `eraseResults` decides what erasing each request answers
 * (a string) or whether it fails (an Error).
 */
export function createMemoryStore({ due = [], mails = [], eraseResults = {} }: { due?: string[]; mails?: DueMail[]; eraseResults?: Record<string, EraseStatus | Error> } = {}) {
  const rows: Row[] = mails.map((mail) => ({ ...mail, leasedUntil: 0, finished: false }));
  const pending = [...due];
  const calls: { method: string; now?: Date }[] = [];
  const store: WorkerStore = {
    async listDue(now) {
      calls.push({ method: 'listDue', now });
      return [...pending];
    },
    async erase(id, now) {
      calls.push({ method: 'erase', now });
      const result = eraseResults[id] ?? 'deleted';
      if (result instanceof Error) throw result;
      pending.splice(pending.indexOf(id), 1);
      return result;
    },
    async claimMail(now) {
      calls.push({ method: 'claimMail', now });
      const claimed = rows.filter((row) => !row.finished && row.leasedUntil <= now.getTime());
      for (const row of claimed) row.leasedUntil = now.getTime() + LEASE_MS;
      return claimed.map(({ leasedUntil: _l, finished: _f, ...mail }) => mail);
    },
    async finishMail(requestId, kind: MailKind) {
      calls.push({ method: 'finishMail' });
      const row = rows.find((r) => r.requestId === requestId && r.kind === kind);
      if (row) row.finished = true;
    },
  };
  return { store, calls, rows };
}

export const mail = (kind: MailKind, requestId: string, formerAthleteKeys: string[] = []): DueMail => ({
  requestId,
  kind,
  email: `${requestId}@example.test`,
  deleteAfter: '2026-12-20T15:00:00.000Z',
  formerAthleteKeys,
});

/** A mailer that records emails; `failFor` lists the addresses whose delivery rejects; `sent` is what it answers otherwise. */
export function createRecordingMailer({ failFor = [], sent = true }: { failFor?: string[]; sent?: boolean } = {}) {
  const emails: Email[] = [];
  const mailer: Mailer = {
    async send(email) {
      emails.push(email);
      if (failFor.includes(email.to)) throw new Error('Resend delivery failed (network)');
      return sent;
    },
  };
  return { mailer, emails };
}
