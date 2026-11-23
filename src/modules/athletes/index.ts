import './i18n';
import type { GalleryEntry } from '../../core/ui';

export { ProfileHeader, type ProfileHeaderProps } from './components/ProfileHeader';
export { EventSelector, type EventSelectorProps, type EventValue } from './components/EventSelector';
export { PersonalBest, type PersonalBestProps } from './components/PersonalBest';
export {
  HistoryList,
  type HistoryListProps,
  type HistoryOrigin,
  type HistoryResult,
  type HistoryValue,
} from './components/HistoryList';
export { ProgressChart, type ProgressChartProps } from './components/ProgressChart';
export { ImportPrompt, type ImportPromptProps } from './components/ImportPrompt';
export {
  AthleteProfileScreen,
  type AthleteProfileContent,
  type AthleteProfileScreenProps,
  type AthleteProfileView,
} from './screens/AthleteProfileScreen';
// Dev only: Metro drops this require from release bundles (issue 1040).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would bundle the gallery in release builds
export const galleryEntries: GalleryEntry[] = __DEV__ ? (require('./gallery') as typeof import('./gallery')).galleryEntries : [];
export type { HistoryMeasurement, HistoryRepository } from './data/history';
export {
  createInMemorySchoolAthleteRepository,
  createPowerSyncSchoolAthleteRepository,
  type SchoolAthlete,
  type SchoolAthleteRepository,
} from './data/schoolAthletes';
export { createInMemoryHistoryRepository } from './data/inMemoryHistoryRepository';
export { createHistoryRepository, createPowerSyncHistoryRepository } from './data/measurementHistoryRepository';
export { personalBest, personalBestKinds, personalBestTime, type PersonalBestResult } from './personalBest';
export { formatShortName } from './formatShortName';
export { formatDate } from './components/formatDate';
export {
  createInMemoryAthleteSchoolRepository,
  createPowerSyncAthleteSchoolRepository,
  type AthleteSchoolLink,
  type AthleteSchoolRepository,
  type AthleteSchoolRow,
} from './data/athleteSchools';
export {
  createInMemoryAthleteRegistrationRepository,
  createSupabaseAthleteRegistrationRepository,
  type AthleteClaimLink,
  type AthleteRegistrationRepository,
  type ClaimAthleteInput,
  type RegisterAthleteInput,
} from './data/athleteRegistration';
export {
  createInMemoryAthleteSchoolEndRepository,
  createSupabaseAthleteSchoolEndRepository,
  type AthleteSchoolEndRepository,
} from './data/athleteSchoolEnd';
export {
  createInMemoryAthleteRepository,
  createPowerSyncAthleteRepository,
  type AthleteProfileInput,
  type AthleteRepository,
} from './data/athleteRepository';
export { athleteProfileHref } from './athleteProfileHref';
export { athleteColor, athleteDisplay, type AthleteColor } from './athleteDisplay';
export { useManagedAthletes, type ManagedAthletesResult } from './data/useManagedAthletes';
export { useAthleteProfileRoute, type AthleteProfileRouteInput, type AthleteProfileRouteState } from './data/useAthleteProfileRoute';
export { AthleteProfileContainer, type AthleteProfileContainerProps } from './screens/AthleteProfileContainer';
export type { ImportedHistoryResult } from './achievements';
export { MyAthletesScreen, type MyAthleteCard, type MyAthletesScreenProps, type MyAthletesView } from './screens/MyAthletesScreen';
export { AthleteEditScreen, type AthleteEditScreenProps } from './screens/AthleteEditScreen';
export { AthleteNameContainer, type AthleteNameContainerProps } from './screens/AthleteNameContainer';
export { AthletePrivateDetailsContainer, type AthletePrivateDetailsContainerProps } from './screens/AthletePrivateDetailsContainer';
export {
  createInMemoryPrivateDetailsRepository,
  createPowerSyncPrivateDetailsRepository,
  type Gender,
  type PrivateDetails,
  type PrivateDetailsInput,
  type PrivateDetailsRepository,
} from './data/athletePrivateDetails';
export { useAthleteNamesVersion } from './data/athleteNamesVersion';
export { MarksScreen, type MarkCard, type MarkSectionView, type MarksScreenProps, type MarksView } from './screens/MarksScreen';
export { MarksContainer, type MarksContainerProps } from './screens/MarksContainer';
export { MyAthletesContainer, type MyAthletesContainerProps } from './screens/MyAthletesContainer';
export type { AthleteShareCodeSlot } from './components/AthleteStack';
export type { AthleteStructure } from './data/useAthleteDetails';
export {
  createInMemoryOtherSchoolResultsRepository,
  createSupabaseOtherSchoolResultsRepository,
  type OtherSchoolResult,
  type OtherSchoolResultsRepository,
} from './data/otherSchoolResults';
export {
  createFileSystemPhotoCache,
  createInMemoryAthletePhotoRepository,
  createInMemoryPhotoCache,
  createSupabaseAthletePhotoRepository,
  type AthletePhotoRepository,
  type PhotoCache,
  type PhotoRef,
} from './data/athletePhotos';
export { useAthletePhoto, type AthletePhoto } from './data/useAthletePhoto';
export { useAthletePhotoCacheGuard } from './data/useAthletePhotoCacheGuard';
export {
  createExpoPhotoPicker,
  createInMemoryPhotoPicker,
  PHOTO_QUALITY,
  PHOTO_SIZE,
  squareCrop,
  type PhotoPicker,
  type PhotoPickResult,
  type PhotoSource,
} from './data/athletePhotoPicker';
export {
  createAthletePhotoService,
  createFileSystemLocalPhotoFiles,
  createInMemoryLocalPhotoFiles,
  createInMemoryPhotoObjects,
  createInMemoryPhotoRows,
  createInMemoryPhotoUploadQueue,
  createPowerSyncPhotoRows,
  createPowerSyncPhotoUploadQueue,
  getAthletePhotoService,
  createSupabasePhotoObjects,
  PhotoRejectedError,
  type AthletePhotoService,
  type LocalPhotoFiles,
  type PhotoObjects,
  type PhotoRow,
  type PhotoRows,
  type PhotoUpload,
  type PhotoUploadQueue,
} from './data/athletePhotoUploads';
export { PhotoCard, type PhotoCardNotice, type PhotoCardProps, type PhotoCardState } from './components/PhotoCard';
export { PhotoRemoveSheet, type PhotoRemoveSheetProps } from './components/PhotoRemoveSheet';
export { AthletePhotoContainer, type AthletePhotoContainerProps } from './screens/AthletePhotoContainer';
export { useAthletePhotoUploads } from './data/useAthletePhotoUploads';
export {
  createInMemoryAthleteRelinkRepository,
  createSupabaseAthleteRelinkRepository,
  type AthleteRelinkRepository,
  type InMemoryRelinkMarker,
  type InMemoryRelinkWorld,
  type RelinkRequest,
  type RelinkRequestResult,
  type RelinkResolution,
  type RelinkStatus,
  type SchoolRelinkRequest,
} from './data/athleteRelink';
export { RelinkRequestContainer, type RelinkRequestContainerProps } from './screens/RelinkRequestContainer';
export {
  RelinkRequestScreen,
  type RelinkRequestScreenProps,
  type RelinkRequestState,
  type RelinkRequestsView,
} from './screens/RelinkRequestScreen';
export {
  createInMemoryAthleteRecoveryCodeRepository,
  createSupabaseAthleteRecoveryCodeRepository,
  type AthleteRecoveryCodeRepository,
  type RecoveryCodes,
} from './data/athleteRecoveryCodes';
export { createInMemoryRecoveryCodeVault, createSecureStoreRecoveryCodeVault, type RecoveryCodeVault } from './data/recoveryCodeVault';
