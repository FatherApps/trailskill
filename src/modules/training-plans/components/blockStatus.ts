import { t } from '../../../core/i18n';
import type { TagProps } from '../../../core/ui';
import '../i18n';
import { blockStatuses, type BlockStatus } from '../types';

export type StatusInput = {
  status: BlockStatus;
  // For 'partial': "Parcial · 3 de 4". Number of repetitions marked done, whether or not their time was recorded
  // (a missing time shows as "—", never zero, and does not change the count). It never comes from the recorded times.
  completedRepetitions?: number;
  repetitions: number;
};

export function nextStatus(status: BlockStatus): BlockStatus {
  return blockStatuses[(blockStatuses.indexOf(status) + 1) % blockStatuses.length];
}

// The single status → Tag map, shared by the Today view and the fulfillment grid.
export function statusTag({ status, completedRepetitions, repetitions }: StatusInput): TagProps {
  switch (status) {
    case 'done':
      return { variant: 'ok', icon: 'check', label: t('training_plans.today.status.done') };
    case 'partial':
      return {
        variant: 'warn',
        icon: 'incomplete_circle',
        label:
          typeof completedRepetitions === 'number'
            ? t('training_plans.today.status.partial', { done: completedRepetitions, total: repetitions })
            : t('training_plans.today.status.partial_plain'),
      };
    case 'absent':
      return { variant: 'neutral', icon: 'close', label: t('training_plans.today.status.absent') };
    case 'not_marked':
      return { variant: 'outline', icon: 'radio_button_unchecked', label: t('training_plans.today.status.not_marked') };
  }
}

// Same text as the tag, for accessibility labels.
export const statusLabel = (input: StatusInput): string => statusTag(input).label;
