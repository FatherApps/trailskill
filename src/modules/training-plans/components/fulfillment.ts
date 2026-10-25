import type { BlockStatus, PlanBlock, PlanVocabulary } from '../types';

// `skipped`: no current record_times authorization, so the athlete is not timed and their cells cannot be marked.
export type FulfillmentAthlete = { id: string; shortName: string; skipped?: boolean };

export type FulfillmentChange = {
  kind: 'marked' | 'corrected';
  author: string;
  // Already formatted by the caller, for example "24 oct".
  dateLabel: string;
};

export type FulfillmentCell = {
  status: BlockStatus;
  // For 'partial'; any amount received by props is accepted.
  completedRepetitions?: number;
  // For timed blocks (per_repetition, series_total). Only shown while the status is done or partial.
  timesRecorded?: number;
  change?: FulfillmentChange;
};

export type FulfillmentContent = {
  athletes: FulfillmentAthlete[];
  blocks: PlanBlock[];
  vocabulary: PlanVocabulary;
  // Keyed by cellKey(athleteId, blockId); a missing cell is not_marked.
  cells: Record<string, FulfillmentCell>;
};

export const cellKey = (athleteId: string, blockId: string) => `${athleteId}:${blockId}`;
