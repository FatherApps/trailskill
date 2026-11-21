import { useEffect, useState } from 'react';

import { supabase } from '../../../core/sync';
import type { KnownDeletionStatus, KnownDeletionStatusRepository } from './knownDeletionStatus';

/** A school that still links the account: deleting is refused until the school unlinks the person. */
export type BlockingSchool = { id: string; name: string };

/** Why a step did not go through. `offline` is decided on the phone or by a request that never arrived; the rest is the server's answer. */
export type AccountDeletionFailure =
  | { code: 'blocked_by_school'; schools: BlockingSchool[] }
  | { code: 'platform_admin' }
  | { code: 'offline' | 'rate_limited' | 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'unavailable' };

export type AccountDeletionOutcome<T> = { ok: true; value: T } | { ok: false; error: AccountDeletionFailure };

export type RequestedDeletion = { status: 'code_sent'; emailSent: boolean } | { status: 'already_marked'; deleteAfter: string };
export type ConfirmedDeletion = { status: 'marked'; deleteAfter: string; emailSent: boolean } | { status: 'already_marked'; deleteAfter: string };
export type CancelledDeletion = { status: 'cancelled' | 'not_marked' };

/**
 * The three steps of deleting the account of the person who is signed in, on the `accounts-delete-account` function (issue 1244): the
 * server decides who may delete, so a screen never replaces its answer. Online only.
 */
export interface AccountDeletionRepository {
  /** Sends the 6-digit code by email, or says the account is already marked. */
  request(): Promise<AccountDeletionOutcome<RequestedDeletion>>;
  /** Marks the account to be deleted in 30 days; the code is the one that was emailed. */
  confirm(code: string): Promise<AccountDeletionOutcome<ConfirmedDeletion>>;
  /** Takes the mark off. */
  cancel(): Promise<AccountDeletionOutcome<CancelledDeletion>>;
  /** When the account will be deleted (an ISO timestamp), or null when it is not marked. Throws when the server could not be asked. */
  status(): Promise<string | null>;
}

type FunctionsError = { name?: string; context?: { json(): Promise<unknown> } };
export type AccountDeletionClient = {
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: FunctionsError | null }> };
  rpc(name: 'account_deletion_status'): PromiseLike<{ data: unknown; error: unknown }>;
};

const KNOWN: ReadonlySet<string> = new Set(['rate_limited', 'invalid_code', 'code_expired', 'too_many_attempts', 'unavailable']);

function failureOf(body: { error?: { code?: unknown; schools?: unknown } } | null): AccountDeletionFailure {
  const code = body?.error?.code;
  if (code === 'platform_admin') return { code };
  if (code === 'blocked_by_school') {
    const schools = Array.isArray(body?.error?.schools) ? (body.error.schools as BlockingSchool[]) : [];
    return { code, schools: schools.filter((school) => typeof school?.name === 'string') };
  }
  return { code: typeof code === 'string' && KNOWN.has(code) ? (code as 'unavailable') : 'unavailable' };
}

export function createSupabaseAccountDeletionRepository(client: AccountDeletionClient = supabase as unknown as AccountDeletionClient): AccountDeletionRepository {
  async function call<T>(body: Record<string, unknown>): Promise<AccountDeletionOutcome<T>> {
    let answer;
    try {
      answer = await client.functions.invoke('accounts-delete-account', { body });
    } catch {
      return { ok: false, error: { code: 'offline' } };
    }
    const { data, error } = answer;
    if (!error) {
      // A success with no value is not a success the screens could read: it is shown like any other failure.
      const value = (data as { value?: T } | null)?.value;
      return value === undefined ? { ok: false, error: { code: 'unavailable' } } : { ok: true, value };
    }
    // A refusal carries `{ ok: false, error: { code } }`; no response at all is a connection that is not there.
    if (error.name === 'FunctionsHttpError' && error.context) {
      return { ok: false, error: failureOf((await error.context.json().catch(() => null)) as Parameters<typeof failureOf>[0]) };
    }
    return { ok: false, error: { code: error.name === 'FunctionsFetchError' ? 'offline' : 'unavailable' } };
  }
  return {
    request: () => call({ step: 'request' }),
    confirm: (code) => call({ step: 'confirm', code }),
    cancel: () => call({ step: 'cancel' }),
    async status() {
      const { data, error } = await client.rpc('account_deletion_status');
      if (error) throw error;
      return typeof data === 'string' ? data : null;
    },
  };
}

type Answer = AccountDeletionOutcome<never>;

/**
 * For tests and the gallery. `blockedBy` makes every step answer that the account is linked to those schools; `offline` makes the
 * server unreachable. `calls` lists the steps that reached it, so a test can show that nothing went out.
 */
export function createInMemoryAccountDeletionRepository(
  options: { blockedBy?: BlockingSchool[]; platformAdmin?: boolean; offline?: boolean; deleteAfter?: string | null; code?: string; failWith?: AccountDeletionFailure['code'] } = {},
) {
  const code = options.code ?? '123456';
  const repository = {
    calls: [] as string[],
    deleteAfter: options.deleteAfter ?? null,
    async request(): Promise<AccountDeletionOutcome<RequestedDeletion>> {
      const refused = refusal('request');
      if (refused) return refused;
      if (repository.deleteAfter) return { ok: true, value: { status: 'already_marked', deleteAfter: repository.deleteAfter } };
      return { ok: true, value: { status: 'code_sent', emailSent: true } };
    },
    async confirm(typed: string): Promise<AccountDeletionOutcome<ConfirmedDeletion>> {
      const refused = refusal('confirm');
      if (refused) return refused;
      if (repository.deleteAfter) return { ok: true, value: { status: 'already_marked', deleteAfter: repository.deleteAfter } };
      if (typed !== code) return { ok: false, error: { code: 'invalid_code' } };
      repository.deleteAfter = '2026-12-20T15:00:00.000Z';
      return { ok: true, value: { status: 'marked', deleteAfter: repository.deleteAfter, emailSent: true } };
    },
    async cancel(): Promise<AccountDeletionOutcome<CancelledDeletion>> {
      const refused = refusal('cancel');
      if (refused) return refused;
      const marked = repository.deleteAfter !== null;
      repository.deleteAfter = null;
      return { ok: true, value: { status: marked ? 'cancelled' : 'not_marked' } };
    },
    async status() {
      repository.calls.push('status');
      if (options.offline) throw new Error('no signal');
      return repository.deleteAfter;
    },
  };
  function refusal(step: string): Answer | undefined {
    repository.calls.push(step);
    if (options.offline) return { ok: false, error: { code: 'offline' } };
    if (options.platformAdmin) return { ok: false, error: { code: 'platform_admin' } };
    if (options.blockedBy && step !== 'cancel') return { ok: false, error: { code: 'blocked_by_school', schools: options.blockedBy } };
    if (options.failWith) return { ok: false, error: { code: options.failWith } as AccountDeletionFailure };
    return undefined;
  }
  return repository satisfies AccountDeletionRepository;
}

/**
 * `reading` while only the phone is being read (no spinner: it takes a frame, and a known state follows at once); `loading` while the server
 * is awaited with nothing known (the spinner); `unknown` when nothing is known and the server could not be asked (the app then opens as
 * usual, as it does offline).
 */
export type AccountDeletionStatus = { state: 'reading' | 'loading' | 'unknown' | 'active' } | { state: 'marked'; deleteAfter: string };

/** Longest the app waits, with nothing known on the phone, before it opens as usual. */
export const DELETION_STATUS_TIMEOUT_MS = 4000;

const statusOf = (deleteAfter: string | null): KnownDeletionStatus => (deleteAfter ? { state: 'marked', deleteAfter } : { state: 'active' });

/**
 * Asks, each time the app opens for a signed-in person, whether their account is marked for deletion, and tells the layout at once
 * what the phone last learned (`known`), so the app paints from the device and the server's answer arrives in the background (issue
 * 1311). A marked account is blocked as soon as the server says so, even after the time limit; an answer is remembered for the next
 * opening. With nothing known (the first opening on this phone) it waits up to the time limit, then opens as usual: a marked account
 * syncs nothing, so nothing of it shows. `refresh` asks again, for after a cancellation, and never trusts what was remembered.
 */
export function useAccountDeletionStatus(
  repository: AccountDeletionRepository,
  userId: string | undefined,
  known?: KnownDeletionStatusRepository,
): AccountDeletionStatus & { refresh: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; status: AccountDeletionStatus }>();
  // The key whose read of the phone finished, with or without a known state.
  const [readKey, setReadKey] = useState<string>();
  const key = `${userId}:${attempt}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let shown = false;
    let answered = false;
    const show = (status: AccountDeletionStatus) => {
      if (!active) return;
      shown = true;
      clearTimeout(timer);
      setAnswer({ key, status });
    };
    const timer = setTimeout(() => !shown && show({ state: 'unknown' }), DELETION_STATUS_TIMEOUT_MS);
    const remembered = attempt === 0 && known ? known.read(userId).catch(() => null) : Promise.resolve(null);
    // The server's answer always wins over what was remembered, whichever arrives first.
    remembered.then((saved) => {
      if (active) setReadKey(key);
      if (saved && !answered) show(saved);
    });
    repository.status().then(
      (deleteAfter) => {
        // An answer to a question already replaced (another person, or asked again after a cancellation) says nothing about now.
        if (!active) return;
        answered = true;
        const status = statusOf(deleteAfter);
        show(status);
        known?.write(userId, status).catch(() => {});
      },
      // Not asked: what the phone knows stands, and with nothing known the app opens as usual.
      () => void remembered.then((saved) => !saved && !shown && show({ state: 'unknown' })),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [repository, known, userId, key, attempt]);

  // Nobody is signed in: there is no account to ask about, so the layout goes on as it always did.
  const readsPhone = known !== undefined && attempt === 0 && readKey !== key;
  const status: AccountDeletionStatus = !userId
    ? { state: 'unknown' }
    : answer?.key === key
      ? answer.status
      : { state: readsPhone ? 'reading' : 'loading' };
  return { ...status, refresh: () => setAttempt((value) => value + 1) };
}
