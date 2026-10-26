import './i18n';

export { BlockCard, type BlockCardProps } from './components/BlockCard';
export { FulfillmentGrid, type FulfillmentGridProps } from './components/FulfillmentGrid';
export {
  cellKey,
  type FulfillmentAthlete,
  type FulfillmentCell,
  type FulfillmentChange,
  type FulfillmentContent,
} from './components/fulfillment';
export { FulfillmentScreen, type FulfillmentScreenProps, type FulfillmentView } from './screens/FulfillmentScreen';
export { PlanBuilderScreen, type PlanBuilderScreenProps } from './screens/PlanBuilderScreen';
export {
  TodayScreen,
  type TodayBlock,
  type TodayContent,
  type TodayNote,
  type TodayScreenProps,
  type TodayView,
} from './screens/TodayScreen';
export type {
  BlockPhase,
  BlockRecording,
  BlockStatus,
  PlanBlock,
  PlanVocabulary,
  VocabularyOption,
} from './types';
export { PlanEditorScreen, type PlanEditorScreenProps } from './screens/PlanEditorScreen';
export { PlansScreen, type PlansScreenProps } from './screens/PlansScreen';
export { PlanListScreen, type PlanListScreenProps, type PlanListView } from './screens/PlanListScreen';
export { planVocabulary } from './vocabulary';
export { galleryEntries } from './gallery';
export { createInMemoryTrainingPlanRepository, type InMemoryTrainingPlanRepository } from './data/inMemoryTrainingPlanRepository';
export { createPowerSyncTrainingPlanRepository } from './data/powerSyncTrainingPlanRepository';
export { BlockHasFulfillmentError } from './data/plans';
export type { Plan, PlanSummary, TrainingPlanRepository } from './data/plans';
export { createInMemoryAssignmentRepository } from './data/inMemoryAssignmentRepository';
export { createPowerSyncAssignmentRepository } from './data/powerSyncAssignmentRepository';
export {
  athletesOfTarget,
  PlanNotAssignableError,
  TargetNotInChargeError,
  TargetOutsideSchoolError,
  type Assignment,
  type AssignmentRepository,
  type AssignmentTarget,
  type NewAssignment,
} from './data/assignments';
export { createInMemoryFulfillmentRepository } from './data/inMemoryFulfillmentRepository';
export { createPowerSyncFulfillmentRepository } from './data/powerSyncFulfillmentRepository';
export { InvalidFulfillmentError, type FulfillmentMark, type FulfillmentRepository, type NewFulfillmentMark } from './data/fulfillment';
export { assignPlan, canWithdraw, checkTarget, listAssignmentsOfDay, loadAssignScope, type AssignScope } from './data/assignable';
export { AssignPlanScreen, type AssignedRow, type AssignmentKind, type AssignOption, type AssignPlanContent, type AssignPlanScreenProps, type AssignPlanView } from './screens/AssignPlanScreen';
export { FulfillmentContainer, type FulfillmentContainerProps } from './screens/FulfillmentContainer';
export { AssignPlanContainer, type AssignPlanContainerProps } from './screens/AssignPlanContainer';
export { createInMemoryNoticeRepository } from './data/inMemoryNoticeRepository';
export { createPowerSyncNoticeRepository } from './data/powerSyncNoticeRepository';
export { InvalidNoticeError, MAX_NOTICE_LENGTH, type Notice, type NewNotice, type NoticeRepository } from './data/notices';
export { TodayContainer, type TodayContainerProps } from './screens/TodayContainer';
