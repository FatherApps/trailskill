// Synthetic copy for the development gallery, taken from the design-system StateView preview.
export const stateViewFixture = {
  empty: {
    title: 'Aún no hay tiempos',
    message: 'Cuando el entrenador registre una medición de Lucía R., aparecerá aquí.',
  },
  error: {
    title: 'No pudimos cargar el historial',
    message: 'Revisa tu conexión e inténtalo de nuevo.',
    action: 'Intentar de nuevo',
  },
  offline: {
    title: 'Estás sin conexión',
    message: 'Mostramos lo guardado en este teléfono el martes 7:12.',
  },
  denied: {
    title: 'Esta información es privada',
    message: 'Solo el acudiente de Sara P. y su escuela pueden verla.',
    action: 'Pedir acceso a la escuela',
  },
};
