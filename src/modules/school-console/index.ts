import './i18n';

export { Logo, type LogoProps } from './components/Logo';
export { ConsoleNav, type ConsoleDestinationId, type ConsoleNavProps } from './components/ConsoleNav';
export { SideSheet, type SideSheetProps } from './components/SideSheet';
export { ConsoleLayout, consoleLayoutFor, type ConsoleLayoutKind, type ConsoleLayoutProps } from './components/ConsoleLayout';
export { AthleteIndicators, type AthleteIndicatorsProps } from './components/AthleteIndicators';
export { AthleteFilters, type AthleteFiltersProps } from './components/AthleteFilters';
export { AthleteTable, type AthleteTableProps } from './components/AthleteTable';
export { AthleteDetail, type AthleteDetailProps } from './components/AthleteDetail';
export { AthleteFilterOptions, type AthleteFilterOption, type AthleteFilterOptionsProps } from './components/AthleteFilterOptions';
export { eventLabel, personalBestLabel } from './components/eventLabel';
export type {
  AthleteAuthorization,
  AthleteBest,
  AthleteDetailData,
  AthleteFilterId,
  AthleteRow,
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
export { useAdminSchool, type AdminSchoolResult } from './data/useAdminSchool';
export { galleryEntries } from './gallery';
export { createInMemoryStaffSchoolRepository, createPowerSyncStaffSchoolRepository } from './data/staffSchools';
export type { StaffMembershipRow, StaffSchool, StaffSchoolRepository } from './data/staffSchools';
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
