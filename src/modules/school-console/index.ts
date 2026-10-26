import './i18n';

export { ConsoleNav, type ConsoleDestinationId, type ConsoleNavProps } from './components/ConsoleNav';
export { SideSheet, type SideSheetProps } from './components/SideSheet';
export { ConsoleLayout, consoleLayoutFor, type ConsoleLayoutKind, type ConsoleLayoutProps } from './components/ConsoleLayout';
export { AthleteIndicators, type AthleteIndicatorsProps } from './components/AthleteIndicators';
export { AthleteFilters, type AthleteFiltersProps } from './components/AthleteFilters';
export { AthleteTable, type AthleteTableProps } from './components/AthleteTable';
export { AthleteDetail, type AthleteDetailProps } from './components/AthleteDetail';
export { AthleteFilterOptions, type AthleteFilterOption, type AthleteFilterOptionsProps } from './components/AthleteFilterOptions';
export { CoachList, type CoachListProps, type CoachRow } from './components/CoachList';
export { InviteCoachSheet, type CoachInvitation, type InviteCoachSheetProps, type InviteGroup, type InviteGroups } from './components/InviteCoachSheet';
export { AuthorizationList, SharingRequestList, type AthleteAuthorizations, type AuthorizationListProps, type AuthorizationPurpose, type AuthorizationStatus, type SharingRequest, type SharingRequestListProps, type SharingRequestsState } from './components/AuthorizationList';
export { MeasurementLog, type MeasurementEntry, type MeasurementLogProps, type MeasurementVersion } from './components/MeasurementLog';
export { RecordTable, type RecordRow, type RecordTableProps } from './components/RecordTable';
export type { SectionView } from './components/SectionFrame';
export { eventLabel, personalBestLabel } from './components/eventLabel';
export type {
  AthleteAuthorization,
  AthleteBest,
  AthleteDetailData,
  AthleteFilterId,
  AthleteRow,
  MeasurementFilterId,
} from './components/athleteTypes';
export {
  AthletesScreen,
  type AthletesContent,
  type AthletesFilterSheet,
  type AthletesScreenProps,
  type AthletesView,
} from './screens/AthletesScreen';
export { AthletesSection, type AthletesSectionProps } from './screens/AthletesSection';
export { ConsoleScreen, type ConsoleScreenProps, type ConsoleSectionProps } from './screens/ConsoleScreen';
export { EmptySectionScreen, type EmptySectionScreenProps } from './screens/EmptySectionScreen';
export { useAdminSchool, useStaffSchool, type AdminSchoolResult, type StaffSchoolResult } from './data/useAdminSchool';
export { CoachesScreen, type CoachesContent, type CoachesScreenProps, type CoachesView } from './screens/CoachesScreen';
export { RecordsScreen, type RecordsContent, type RecordsScreenProps, type RecordsSheet, type RecordsView } from './screens/RecordsScreen';
export { RecordsSection, type RecordsSectionProps } from './screens/RecordsSection';
export {
  createCategoryRecordsRepository,
  createInMemoryCategoryRecordsRepository,
  createPowerSyncCategoryRecordsRepository,
  selectCategoryRecords,
  type CategoryRecord,
  type CategoryRecordsQuery,
  type CategoryRecordsRepository,
} from './data/categoryRecords';
export {
  MeasurementsScreen,
  type MeasurementsContent,
  type MeasurementsFilterSheet,
  type MeasurementsScreenProps,
  type MeasurementsView,
} from './screens/MeasurementsScreen';
export { MeasurementsSection, type MeasurementsSectionProps } from './screens/MeasurementsSection';
export {
  createMeasurementLogRepository,
  createPowerSyncMeasurementLogRepository,
  filterMeasurements,
  measurementFilterOptions,
  type LogMeasurement,
  type MeasurementFilters,
  type MeasurementLogRepository,
} from './data/measurementLog';
export {
  AuthorizationsScreen,
  type AuthorizationsContent,
  type AuthorizationsScreenProps,
  type AuthorizationsView,
} from './screens/AuthorizationsScreen';
export { AuthorizationsSection, type AuthorizationsSectionProps } from './screens/AuthorizationsSection';
export {
  createAuthorizationsRepository,
  createPowerSyncAuthorizationsRepository,
  type AuthorizationsRepository,
  type ConsoleAuthorizationRow,
} from './data/authorizations';
export { CoachesSection, type CoachesSectionProps } from './screens/CoachesSection';
export { createInMemoryCoachRepository, createPowerSyncCoachRepository } from './data/coaches';
export type { Coach, CoachMembershipRow, CoachRepository } from './data/coaches';
export { galleryEntries } from './gallery';
export { createInMemoryStaffSchoolRepository, createPowerSyncStaffSchoolRepository } from './data/staffSchools';
export type { StaffMembershipRow, StaffSchool, StaffSchoolRepository } from './data/staffSchools';
export {
  createInMemorySchoolNameRepository,
  createPowerSyncSchoolNameRepository,
  type SchoolName,
  type SchoolNameRepository,
} from './data/schoolNames';
export {
  CONSOLE_BEST_EVENT,
  createConsoleAthletesRepository,
  createPowerSyncConsoleAthletesRepository,
  type ConsoleAthlete,
  type ConsoleAthletesRepository,
} from './data/consoleAthletes';
export {
  createInMemorySchoolStructureRepository,
  createPowerSyncSchoolStructureRepository,
  type CoachAssignment,
  type SchoolCategory,
  type SchoolGroup,
  type SchoolStructureRepository,
  type SchoolStructureRows,
} from './data/schoolStructure';
export {
  athleteIndicators,
  filterAthletes,
  filterOptions,
  startOfWeek,
  type ConsoleIndicators,
  type FilterOption,
} from './data/athletesList';
export {
  createInMemoryCategoriesRepository,
  createPowerSyncCategoriesRepository,
  type AthleteSchoolRow,
  type CategoriesRepository,
  type Category,
  type InMemoryCategoriesData,
} from './data/categories';
export { CategoriesScreen, type CategoriesContent, type CategoriesScreenProps } from './screens/CategoriesScreen';
export { CategoriesSection, type CategoriesSectionProps } from './screens/CategoriesSection';
export { useCategories, type CategoriesState, type UseCategories } from './data/useCategories';
