import type { GalleryEntry } from '../../core/ui';

export { createInMemoryMeasurementRepository } from './data/inMemoryMeasurementRepository';
export { CompletedMeasurementTimeError, DiscardedMeasurementError, InvalidMeasurementMetersError, InvalidMeasurementTimeError } from './data/measurements';
export type {
  Measurement,
  MeasurementEvent,
  MeasurementKind,
  MeasurementRepository,
  MeasurementSource,
  SessionType,
} from './data/measurements';
export { createPowerSyncMeasurementRepository } from './data/powerSyncMeasurementRepository';
// Dev only: Metro drops this require from release bundles (issue 1040).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would bundle the gallery in release builds
export const galleryEntries: GalleryEntry[] = __DEV__ ? (require('./gallery') as typeof import('./gallery')).galleryEntries : [];
export { ArrivalButton, type ArrivalButtonProps } from './components/ArrivalButton';
export { ArrivalList, type ArrivalListProps } from './components/ArrivalList';
export { NameCard, type NameCardProps } from './components/NameCard';
export { Stopwatch, type StopwatchProps, type StopwatchState } from './components/Stopwatch';
export { TimingHeader, type TimingHeaderProps } from './components/TimingHeader';
export { StopwatchScreen, type StopwatchScreenProps } from './screens/StopwatchScreen';
export {
  TimingSetupScreen,
  type SetupAthlete,
  type SetupField,
  type TimingSetupScreenProps,
} from './screens/TimingSetupScreen';
export { TimingSummaryScreen, type SummaryRecord, type TimingSummaryScreenProps } from './screens/TimingSummaryScreen';
export {
  SeriesAssignmentScreen,
  type AssignmentAthlete,
  type AssignmentPosition,
  type SeriesAssignmentScreenProps,
} from './screens/SeriesAssignmentScreen';
export { SeriesTimingScreen, type SeriesTimingScreenProps } from './screens/SeriesTimingScreen';
export { IndividualTimingFlow, type IndividualTimingFlowProps } from './screens/IndividualTimingFlow';
export type { RosterAthlete } from './screens/timingSession';
export {
  createInMemorySeriesRepository,
  createPowerSyncSeriesRepository,
  type PendingSeries,
  type SeriesRecord,
  type SeriesRepository,
} from './data/series';
// The arrival logic of a series, for other modules that time several swimmers with one start.
export { press as pressSeries, readySeries, undoLastArrival, type Series } from './domain/series';
export { SeriesTimingFlow, type SeriesTimingFlowProps } from './screens/SeriesTimingFlow';
export {
  createInMemorySessionSetupRepository,
  createSecureStoreSessionSetupRepository,
  type SessionSetup,
  type SessionSetupRepository,
} from './data/sessionSetup';
export { CompletedFlow, type CompletedFlowProps } from './screens/CompletedFlow';
export { CompletedScreen, type CompletedAthlete, type CompletedScreenProps } from './screens/CompletedScreen';
export { SchoolChoiceScreen, type SchoolChoiceScreenProps } from './screens/SchoolChoiceScreen';
export {
  createSupabaseConflictReviewRepository,
  type ConflictReviewRepository,
} from './data/conflictReview';
export { usePlatformAdmin } from './data/usePlatformAdmin';
export { usePlatformAdminStatus } from './data/usePlatformAdminStatus';
export { usePlatformAdminRouteCorrection } from './data/usePlatformAdminRouteCorrection';
export { useKnownPlatformAdminGuard } from './data/useKnownPlatformAdminGuard';
export {
  createInMemoryKnownPlatformAdminRepository,
  createSecureStoreKnownPlatformAdminRepository,
  type KnownPlatformAdminRepository,
} from './data/knownPlatformAdmin';
export { ReviewConflictsFlow, type ReviewConflictsFlowProps } from './screens/ReviewConflictsFlow';
export {
  arrivalButtonAction,
  buttonAction,
  capturedKeys,
  debounce,
  defaultButtonConfig,
  nanosFromSeconds,
  type ButtonAction,
  type ButtonConfig,
  type ButtonPress,
  type ButtonTarget,
} from './domain/timingButton';
export {
  createFakeTimingButton,
  screenClock,
  timingButton,
  unavailableTimingButton,
  type ExternalKeyboard,
  type NativeKeyPress,
  type TimingButtonPort,
} from './data/timingButton';
export {
  buttonSettingsOf,
  useButtonDisconnect,
  useExternalKeyboards,
  useLearnKey,
  useTimingButtons,
  type UseTimingButtonsOptions,
} from './data/useTimingButtons';
export { arrivalButtonsHint, keyName, stopwatchButtonsHint } from './data/keyName';
export {
  consistency,
  defaultMarkMeters,
  halfSplit,
  paceSegments,
  projectFinish,
  type PaceMark,
  type PaceSegment,
} from './domain/pace';
