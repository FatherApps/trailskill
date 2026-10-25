import './i18n';

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
export { ImportPrompt, type ImportPromptProps } from './components/ImportPrompt';
export {
  AthleteProfileScreen,
  type AthleteProfileContent,
  type AthleteProfileScreenProps,
  type AthleteProfileView,
} from './screens/AthleteProfileScreen';
export { galleryEntries } from './gallery';
export type { HistoryMeasurement, HistoryRepository } from './data/history';
export {
  createInMemorySchoolAthleteRepository,
  createPowerSyncSchoolAthleteRepository,
  type SchoolAthlete,
  type SchoolAthleteRepository,
} from './data/schoolAthletes';
export { createInMemoryHistoryRepository } from './data/inMemoryHistoryRepository';
export { createHistoryRepository, createPowerSyncHistoryRepository } from './data/measurementHistoryRepository';
export { personalBest, personalBestKinds, type PersonalBestResult } from './personalBest';
export { formatShortName } from './formatShortName';
export {
  createInMemoryAthleteRepository,
  createPowerSyncAthleteRepository,
  type AthleteProfileInput,
  type AthleteRepository,
} from './data/athleteRepository';
export { athleteDisplay, type AthleteColor } from './athleteDisplay';
export { useManagedAthletes, type ManagedAthletesResult } from './data/useManagedAthletes';
export { AthleteProfileContainer, type AthleteProfileContainerProps } from './screens/AthleteProfileContainer';
