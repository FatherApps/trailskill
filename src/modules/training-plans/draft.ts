import { MAX_DRILL_LENGTH } from './data/plans';
import type { PlanBlock, PlanVocabulary } from './types';

// A block being edited: what is recorded starts unset and must be chosen before the plan can be saved.
export type DraftBlock = Omit<PlanBlock, 'recording'> & { recording: PlanBlock['recording'] | null };

export { MAX_DRILL_LENGTH };

export type BlockErrors = { activity?: 'required' | 'too_long'; recording?: 'required' };

export function newDraftBlock(id: string, vocabulary: PlanVocabulary): DraftBlock {
  return {
    id,
    phase: 'main',
    repetitions: 1,
    distance: vocabulary.distances[0],
    activity: '',
    equipment: [],
    sendOffSeconds: null,
    recording: null,
  };
}

// An activity that is not a vocabulary option is a free-text drill.
export const isOption = (vocabulary: PlanVocabulary, activity: string) =>
  vocabulary.activities.some((option) => option.value === activity);

export function blockErrors(block: DraftBlock, vocabulary: PlanVocabulary): BlockErrors {
  const errors: BlockErrors = {};
  const activity = block.activity.trim();
  if (activity === '') errors.activity = 'required';
  else if (!isOption(vocabulary, activity) && activity.length > MAX_DRILL_LENGTH) errors.activity = 'too_long';
  if (block.recording === null) errors.recording = 'required';
  return errors;
}

export const hasErrors = (errors: BlockErrors) => Object.keys(errors).length > 0;

export function toPlanBlock(block: DraftBlock): PlanBlock {
  if (block.recording === null) throw new Error('A block needs what is recorded before it is saved');
  return { ...block, recording: block.recording };
}

// Key order does not matter: the same plan read from storage or built by editing gives the same text.
const sortKeys = (_key: string, value: unknown) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value;

// The draft as it is compared with what is stored; the name is trimmed because that is how it is saved.
export const snapshot = (name: string, blocks: DraftBlock[]) => JSON.stringify({ name: name.trim(), blocks }, sortKeys);
