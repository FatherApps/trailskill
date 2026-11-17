import type { Invitation, InvitationSender } from './port.ts';
import { resendBody, resendSubject } from './resendTexts.ts';

/**
 * Sends the invitation as an email through Resend. Rejects when it was not delivered. The errors say the HTTP status or
 * "network" and nothing else: the response body, the request and the error of a failed call could echo the key or the address.
 * `from` is the sender verified in Resend; without it every delivery fails before any request leaves.
 */
export function createResendSender({ apiKey, from, fetch }: { apiKey: string; from: string; fetch: typeof globalThis.fetch }): InvitationSender {
  return {
    async deliver(invitation: Invitation) {
      if (!from) throw new Error('Resend sender is not configured');
      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [invitation.email], subject: resendSubject(invitation), text: resendBody(invitation) }),
        });
      } catch {
        throw new Error('Resend delivery failed (network)');
      }
      // An unread body keeps its resource open in Deno; releasing it must never change the outcome.
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new Error(`Resend delivery failed (HTTP ${response.status})`);
    },
  };
}
