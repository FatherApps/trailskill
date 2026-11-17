import type { Invitation } from './port.ts';

type Named = Pick<Invitation, 'schoolName'>;

/** Only the school name is taken from the invitation: the recipient is the `to` of the message, and the rest (ids, links) has no place in an email. */
export const resendSubject = ({ schoolName }: Named) => `Invitación de ${schoolName} en Swimcro`;

export const resendBody = ({ schoolName }: Named) =>
  [
    `${schoolName} te invitó a ser entrenador en Swimcro.`,
    'Para aceptar la invitación, abre la app Swimcro e inicia sesión con este mismo correo.',
    'Si no esperabas esta invitación, puedes ignorar este mensaje.',
  ].join('\n');
