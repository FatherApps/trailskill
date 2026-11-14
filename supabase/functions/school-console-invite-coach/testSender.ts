import type { Invitation, InvitationSender } from './port.ts';

/**
 * The only adapter of the sending port. It sends nothing and opens no connection: it records what it was asked to deliver.
 * The real provider (email or SMS) is an open maintainer decision (#63); it will be a new adapter of the same port.
 */
export function createTestSender(): InvitationSender & { delivered: Invitation[] } {
  const delivered: Invitation[] = [];
  return {
    delivered,
    async deliver(invitation) {
      delivered.push(invitation);
    },
  };
}
