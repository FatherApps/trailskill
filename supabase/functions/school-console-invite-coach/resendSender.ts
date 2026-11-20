import type { Invitation, InvitationSender } from './port.ts';
import { resendBody, resendSubject } from './resendTexts.ts';

/** How long a call to Resend may take: a hung connection must not hold the invitation request open. */
export const RESEND_TIMEOUT_MS = 10_000;

/**
 * Sends one email through Resend. Resolves true once Resend accepted it; rejects when it was not delivered. The errors say the HTTP status or
 * "network" and nothing else: the response body, the request and the error of a failed call could echo the key or the address.
 * `from` is the sender verified in Resend; without it every delivery fails before any request leaves. A timeout counts as a
 * network failure. The Idempotency-Key makes Resend answer a repeated delivery with the same key without sending again (24 hours).
 */
export async function sendResendEmail({
  apiKey,
  from,
  fetch,
  to,
  subject,
  text,
  idempotencyKey,
  timeoutMs = RESEND_TIMEOUT_MS,
}: {
  apiKey: string;
  from: string;
  fetch: typeof globalThis.fetch;
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
  timeoutMs?: number;
}): Promise<true> {
  if (!from) throw new Error('Resend sender is not configured');
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('Resend delivery failed (network)');
  }
  // An unread body keeps its resource open in Deno; releasing it must never change the outcome.
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new Error(`Resend delivery failed (HTTP ${response.status})`);
  return true;
}

/** Sends the invitation as an email through Resend; the Idempotency-Key is per invitation. See {@link sendResendEmail}. */
export function createResendSender({
  apiKey,
  from,
  fetch,
  timeoutMs = RESEND_TIMEOUT_MS,
}: {
  apiKey: string;
  from: string;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
}): InvitationSender {
  return {
    deliver: (invitation: Invitation) =>
      sendResendEmail({
        apiKey,
        from,
        fetch,
        timeoutMs,
        to: invitation.email,
        subject: resendSubject(invitation),
        text: resendBody(invitation),
        idempotencyKey: `coach-invitation/${invitation.id}`,
      }),
  };
}
