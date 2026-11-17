import type { InvitationSender } from './port.ts';
import { createResendSender } from './resendSender.ts';
import { createTestSender } from './testSender.ts';

/**
 * Chooses the sending adapter from the configuration. Pure (no Deno inside) because index.ts cannot load under Jest:
 * without the key (development, tests) the test sender delivers nothing; with it, Resend sends from RESEND_FROM.
 */
export function selectSender(env: { RESEND_API_KEY?: string; RESEND_FROM?: string }, fetch: typeof globalThis.fetch): InvitationSender {
  if (env.RESEND_API_KEY) return createResendSender({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM ?? '', fetch });
  // A fixed text, so a missing key is visible in the logs without a single value in them.
  console.warn('school-console-invite-coach: RESEND_API_KEY is not set; invitations are recorded but no email is sent');
  return createTestSender();
}
