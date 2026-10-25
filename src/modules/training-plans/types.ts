export type BlockPhase = 'warm_up' | 'main' | 'technique' | 'cool_down';
export type BlockRecording = 'completion' | 'per_repetition' | 'series_total';
export type VocabularyOption = { value: string; label: string };

// The caller supplies the vocabulary (strokes and distances can come from the src/core/sport catalog; drills and equipment have no catalog yet), so screens never import sport vocabulary.
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
