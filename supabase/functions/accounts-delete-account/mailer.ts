import { sendResendEmail } from '../school-console-invite-coach/resendSender.ts';
import type { Email, Mailer } from './port.ts';

/** How many emails the test mailer remembers: it records in memory for the life of the worker, so the record must not grow without bound. */
export const TEST_MAILER_LIMIT = 100;

/** The adapter used without a Resend key (development, tests): sends nothing, opens no connection, records the last TEST_MAILER_LIMIT emails. */
export function createTestMailer(): Mailer & { delivered: Email[] } {
  const delivered: Email[] = [];
  return {
    delivered,
    async send(email) {
      delivered.push(email);
      if (delivered.length > TEST_MAILER_LIMIT) delivered.shift();
      return false;
    },
  };
}

/**
 * Chooses the mailer from the configuration. Pure (no Deno inside) because index.ts cannot load under Jest: without the key the test
 * mailer delivers nothing; with it, Resend sends from RESEND_FROM. `name` is the function, for the warning.
 */
export function selectMailer(env: { RESEND_API_KEY?: string; RESEND_FROM?: string }, fetch: typeof globalThis.fetch, name: string): Mailer {
  if (env.RESEND_API_KEY) {
    const apiKey = env.RESEND_API_KEY;
    const from = env.RESEND_FROM ?? '';
    return { send: (email) => sendResendEmail({ apiKey, from, fetch, ...email }) };
  }
  // A fixed text, so a missing key is visible in the logs without a single value in them.
  console.warn(`${name}: RESEND_API_KEY is not set; no email is sent`);
  return createTestMailer();
}
