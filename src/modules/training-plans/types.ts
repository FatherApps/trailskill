export type BlockPhase = 'warm_up' | 'main' | 'technique' | 'cool_down';
export type BlockRecording = 'completion' | 'per_repetition' | 'series_total';
export type VocabularyOption = { value: string; label: string };

// The sport catalog (src/core/sport) arrives with task 3.1; until then stroke/drill and equipment vocabulary is passed in by the caller.
export type PlanVocabulary = { activities: VocabularyOption[]; equipment: VocabularyOption[]; distances: number[] };

export type PlanBlock = {
  id: string;
  phase: BlockPhase;
  // At least 1.
  repetitions: number;
  // Metres.
  distance: number;
  // A value from vocabulary.activities (a stroke or a drill such as kick).
  activity: string;
  // Values from vocabulary.equipment; may be empty.
  equipment: string[];
  // Send-off interval in seconds; null means none.
  sendOffSeconds: number | null;
  recording: BlockRecording;
};
