import type { Invitation, InvitationSender } from './port.ts';

/** How many deliveries the test sender remembers: it records in memory for the life of the worker, so the record must not grow without bound. */
export const TEST_SENDER_LIMIT = 100;

/**
 * The adapter of the sending port used without a Resend key (development, tests). It sends nothing and opens no connection: it
 * records what it was asked to deliver, the last TEST_SENDER_LIMIT only.
 */
export function createTestSender(): InvitationSender & { delivered: Invitation[] } {
  const delivered: Invitation[] = [];
  return {
    delivered,
    async deliver(invitation) {
      delivered.push(invitation);
      if (delivered.length > TEST_SENDER_LIMIT) delivered.shift();
    },
  };
}
