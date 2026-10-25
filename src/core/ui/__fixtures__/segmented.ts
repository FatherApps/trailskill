import { t } from '../../i18n';
import { distances, strokes } from '../../sport';

// Synthetic options for the development gallery. Strokes and distances come from the sport catalogs.
export const segmentedFixture = {
  strokes: {
    label: 'Estilo',
    options: strokes.slice(0, 3).map(({ code, nameKey }) => ({ value: code, label: t(nameKey) })),
  },
  distances: {
    label: 'Distancia',
    options: distances.slice(0, 4).map(({ code, nameKey }) => ({ value: code, label: t(nameKey) })),
  },
  longText: {
    label: 'Tipo de sesión',
    options: [
      { value: 'short', label: 'Entrenamiento en piscina corta' },
      { value: 'long', label: 'Entrenamiento en piscina larga con el grupo completo' },
      { value: 'open', label: 'Entrenamiento en aguas abiertas' },
    ],
  },
};
