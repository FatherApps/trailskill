import { t } from '../../core/i18n';
import { distances, equipment, strokes } from '../../core/sport';
import type { PlanVocabulary, VocabularyOption } from './types';

// An unknown value falls back to itself, so a catalog that drifts never crashes a screen.
export function labelOf(options: VocabularyOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

// Strokes are the only activity options; a drill is free text, not a catalog entry.
export function planVocabulary(): PlanVocabulary {
  return {
    activities: strokes.map((stroke) => ({ value: stroke.code, label: t(stroke.nameKey) })),
    equipment: equipment.map((item) => ({ value: item.code, label: t(item.nameKey) })),
    distances: distances.map((distance) => distance.meters),
  };
}

// "Libre 50 m": the stroke name and the meters of a measurement's event, from the sport catalogs. An unknown code stays visible as itself.
export function eventLabel(stroke: string, distance: string): string {
  return t('training_plans.home.event', {
    stroke: t(strokes.find((entry) => entry.code === stroke)?.nameKey ?? stroke),
    meters: distances.find((entry) => entry.code === distance)?.meters ?? distance,
  });
}
