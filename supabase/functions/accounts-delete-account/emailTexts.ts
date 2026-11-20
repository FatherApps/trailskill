// Proposed texts (Spanish): the maintainer reviews them before they go live.

/** A date as the people of the pilot read it, for example "20 de diciembre de 2026". */
export const formatDate = (iso: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(new Date(iso));

/** The email with the confirmation code. */
export const codeEmail = (code: string) => ({
  subject: 'Tu código para eliminar tu cuenta de Swimcro',
  text: [
    'Hola,',
    '',
    'Pediste eliminar tu cuenta de Swimcro. Para confirmarlo, escribe este código en la app:',
    '',
    code,
    '',
    'El código es válido por 10 minutos.',
    'Si no fuiste tú, ignora este mensaje: tu cuenta no cambia.',
    '',
    'Equipo Swimcro',
  ].join('\n'),
});

/** The email that says the account is marked for deletion and how to cancel it. */
export const markedEmail = (deleteAfter: string) => ({
  subject: 'Tu cuenta de Swimcro se eliminará',
  text: [
    'Hola,',
    '',
    `Confirmaste la eliminación de tu cuenta de Swimcro. La eliminaremos el ${formatDate(deleteAfter)}.`,
    '',
    'Hasta entonces puedes arrepentirte: abre la app, inicia sesión con este correo y usa «Cancelar eliminación».',
    'Si no fuiste tú, hazlo de inmediato.',
    '',
    'Equipo Swimcro',
  ].join('\n'),
});
