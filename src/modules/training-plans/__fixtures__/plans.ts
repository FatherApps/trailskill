import type { TodayBlock } from '../screens/TodayScreen';
import type { PlanBlock, PlanVocabulary } from '../types';

// Fixture vocabulary until the sport catalog (src/core/sport) arrives with task 3.1.
const vocabulary: PlanVocabulary = {
  activities: [
    { value: 'free', label: 'Libre' },
    { value: 'back', label: 'Espalda' },
    { value: 'breast', label: 'Pecho' },
    { value: 'fly', label: 'Mariposa' },
    { value: 'kick', label: 'Patada' },
  ],
  equipment: [
    { value: 'fins', label: 'Aletas' },
    { value: 'paddles', label: 'Paletas' },
    { value: 'snorkel', label: 'Snorkel' },
    { value: 'board', label: 'Tabla' },
    { value: 'pull_buoy', label: 'Pull buoy' },
  ],
  distances: [25, 50, 100, 200],
};

// One block of every phase and every recording type.
const blocks: PlanBlock[] = [
  { id: 'b1', phase: 'warm_up', repetitions: 1, distance: 200, activity: 'free', equipment: [], sendOffSeconds: null, recording: 'completion' },
  { id: 'b2', phase: 'main', repetitions: 8, distance: 50, activity: 'free', equipment: ['paddles'], sendOffSeconds: 60, recording: 'per_repetition' },
  { id: 'b3', phase: 'technique', repetitions: 4, distance: 25, activity: 'kick', equipment: ['fins', 'board'], sendOffSeconds: 45, recording: 'completion' },
  { id: 'b4', phase: 'technique', repetitions: 6, distance: 25, activity: 'fly', equipment: ['fins'], sendOffSeconds: 90, recording: 'completion' },
  { id: 'b5', phase: 'cool_down', repetitions: 1, distance: 100, activity: 'back', equipment: [], sendOffSeconds: null, recording: 'series_total' },
];

// Statuses cover done, partial, absent and not marked; the first block is completion-only and done, with no time.
const todayBlocks: TodayBlock[] = [
  { block: blocks[0], status: 'done' },
  { block: blocks[1], status: 'partial', completedRepetitions: 3, times: [3105, null, 3162] },
  { block: blocks[2], status: 'absent' },
  { block: blocks[3], status: 'not_marked' },
  { block: blocks[4], status: 'done', times: [9840] },
];

export const plansFixture = {
  vocabulary,
  blocks,
  today: { planName: 'Resistencia aeróbica', blocks: todayBlocks, vocabulary },
  athleteName: 'Lucía R.',
  storedOnLabel: '25 oct',
  // Equipment of the plan above, deduplicated, in first-appearance order.
  equipmentLabels: ['Paletas', 'Aletas', 'Tabla'],
};
