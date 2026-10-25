import './i18n';

export { BlockCard, type BlockCardProps } from './components/BlockCard';
export { PlanBuilderScreen, type PlanBuilderScreenProps } from './screens/PlanBuilderScreen';
export {
  TodayScreen,
  type BlockStatus,
  type TodayBlock,
  type TodayContent,
  type TodayScreenProps,
  type TodayView,
} from './screens/TodayScreen';
export type {
  BlockPhase,
  BlockRecording,
  PlanBlock,
  PlanVocabulary,
  VocabularyOption,
} from './types';
export { PlanEditorScreen, type PlanEditorScreenProps } from './screens/PlanEditorScreen';
export { PlansScreen, type PlansScreenProps } from './screens/PlansScreen';
export { PlanListScreen, type PlanListScreenProps, type PlanListView } from './screens/PlanListScreen';
export { planVocabulary } from './vocabulary';
export { galleryEntries } from './gallery';
export { createInMemoryTrainingPlanRepository } from './data/inMemoryTrainingPlanRepository';
export { createPowerSyncTrainingPlanRepository } from './data/powerSyncTrainingPlanRepository';
export type { Plan, PlanSummary, TrainingPlanRepository } from './data/plans';
