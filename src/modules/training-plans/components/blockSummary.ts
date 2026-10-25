import { t } from '../../../core/i18n';
import '../i18n';
import type { PlanBlock, PlanVocabulary } from '../types';
import { labelOf } from '../vocabulary';

// For example "8 × 50 m Libre".
export function blockSummary(block: Pick<PlanBlock, 'repetitions' | 'distance' | 'activity'>, vocabulary: PlanVocabulary): string {
  return t('training_plans.block.summary', {
    repetitions: block.repetitions,
    distance: block.distance,
    activity: labelOf(vocabulary.activities, block.activity),
  });
}
