import { formatDate } from '../accounts-delete-account/emailTexts.ts';
import type { DueMail } from './port.ts';

// Proposed texts (Spanish): the maintainer reviews them before they go live.

const reminder = (mail: DueMail) => ({
  subject: 'Tu cuenta de Swimcro se eliminará pronto',
  text: [
    'Hola,',
    '',
    `Tu cuenta de Swimcro se eliminará el ${formatDate(mail.deleteAfter)}.`,
    '',
    'Si cambiaste de opinión, abre la app, inicia sesión con este correo y usa «Cancelar eliminación».',
    '',
    'Equipo Swimcro',
  ].join('\n'),
});

const deleted = (mail: DueMail) => ({
  subject: 'Tu cuenta de Swimcro fue eliminada',
  text: [
    'Hola,',
    '',
    'Tu cuenta de Swimcro y tus datos fueron eliminados.',
    ...(mail.formerAthleteKeys.length === 0
      ? []
      : [
          '',
          'Los tiempos que la escuela conserva de forma anónima siguen guardados. Para reclamarlos más adelante necesitas esta clave por cada nadador:',
          '',
          ...mail.formerAthleteKeys,
          '',
          'Guarda estas claves: no volveremos a mostrarlas.',
        ]),
    '',
    'Equipo Swimcro',
  ].join('\n'),
});

const stopped = () => ({
  subject: 'Detuvimos la eliminación de tu cuenta de Swimcro',
  text: [
    'Hola,',
    '',
    'Detuvimos la eliminación de tu cuenta porque una escuela vinculó de nuevo a un nadador a tu cuenta.',
    'No se eliminó nada y tu cuenta sigue activa.',
    '',
    'Equipo Swimcro',
  ].join('\n'),
});

/** The email of a due notice, by kind. */
export const mailEmail = (mail: DueMail) => (mail.kind === 'reminder' ? reminder(mail) : mail.kind === 'deleted' ? deleted(mail) : stopped());
