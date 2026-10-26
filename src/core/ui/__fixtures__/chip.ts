import { t } from '../../i18n';
import { distances, strokes } from '../../sport';

const stroke = (index: number) => t(strokes[index].nameKey);
const distance = (index: number) => t(distances[index].nameKey);

// Synthetic chips for the development gallery: fictional swimmers; events come from the sport catalogs.
export const chipFixture = {
  rest: 'Tomás',
  selected: 'Lucía',
  longText: 'Valentina Fernanda de los Ángeles Restrepo',
  lucia: { initials: 'LR', color: 'athlete-1' },
  tomas: { initials: 'TR', color: 'athlete-2' },
  athletes: [
    { value: 'lucia', label: 'Lucía', dot: { initials: 'LR', color: 'athlete-1' } },
    { value: 'tomas', label: 'Tomás', dot: { initials: 'TR', color: 'athlete-2' } },
  ],
  events: [
    { value: 'FR-50', label: `${stroke(0)} ${distance(1)}` },
    { value: 'FR-100', label: `${stroke(0)} ${distance(2)}` },
    { value: 'BK-50', label: `${stroke(1)} ${distance(1)}` },
    { value: 'BR-50', label: `${stroke(2)} ${distance(1)}` },
  ],
  longList: [
    { value: 'a', label: 'Lucía', dot: { initials: 'LR', color: 'athlete-1' } },
    { value: 'b', label: 'Tomás', dot: { initials: 'TR', color: 'athlete-2' } },
    { value: 'c', label: 'Paula', dot: { initials: 'PG', color: 'athlete-3' } },
    { value: 'd', label: 'Mateo', dot: { initials: 'MC', color: 'athlete-4' } },
    { value: 'e', label: 'Sara', dot: { initials: 'SP', color: 'athlete-1' } },
    { value: 'f', label: 'Valentina', dot: { initials: 'VR', color: 'athlete-2' } },
  ],
} as const;
