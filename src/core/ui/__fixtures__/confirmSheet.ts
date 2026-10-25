import { t } from '../../i18n';

// Synthetic copy for the development gallery, taken from the design-system ConfirmSheet preview.
// The signOut entry uses the app's own copy with synthetic counts.
export const confirmSheetFixture = {
  show: 'Mostrar hoja',
  stop: {
    title: '¿Descartar este tiempo?',
    message: 'El tiempo 0:33,91 de Mateo C. no se guardará. No se puede recuperar.',
    confirm: 'Descartar tiempo',
    cancel: 'Seguir revisando',
  },
  primary: {
    title: '¿Confirmar la importación?',
    message: 'Se agregarán 12 resultados al historial de Lucía R.',
    confirm: 'Confirmar importación',
    cancel: 'Revisar de nuevo',
  },
  signOut: {
    title: t('session.sign_out_pending_title'),
    message: `${t('session.sign_out_pending_message', { count: 3 })} ${t('session.sign_out_rejected', { count: 1 })}`,
    confirm: t('session.sign_out_anyway'),
    cancel: t('session.sign_out_keep'),
  },
};
