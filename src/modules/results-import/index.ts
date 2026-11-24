import type { GalleryEntry } from '../../core/ui';

export type { ImportedResult, ImportedResultsRepository, PendingResultChange } from './data/importedResults';
export { createInMemoryImportedResultsRepository } from './data/inMemoryImportedResultsRepository';
export { createPowerSyncImportedResultsRepository } from './data/powerSyncImportedResultsRepository';
export { createHttpOfficialResultsService, createSupabaseOfficialResultsService } from './data/httpOfficialResultsService';
export { createSupabasePendingChangeResolver } from './data/supabasePendingChangeResolver';
export { createIdentityConfirmation, unconfirmedIdentity } from './data/officialResults';
export type {
  ChangeChoice,
  FoundResult,
  IdentityConfirmation,
  IdentityStatus,
  ImportSummary,
  OfficialResultsError,
  OfficialResultsOutcome,
  OfficialResultsService,
  PendingChangeResolver,
} from './data/officialResults';
export { createOfficialUpdate, sortOutFound, updateButtonState } from './officialUpdate';
export type { CheckOutcome, ImportOutcome, UpdateButtonState } from './officialUpdate';
export { OfficialResultsScreen } from './screens/OfficialResultsScreen';
export type { ChangeItem, ImportNotice, OfficialResultsScreenProps, OfficialResultsView, ResultItem } from './screens/OfficialResultsScreen';
export { ImportFooterSlot, createImportFooterStore, useImportFooterStore, type ImportFooterState, type ImportFooterStore } from './components/ImportFooterSlot';
export { OfficialImportFooter, type OfficialImportFooterProps } from './components/OfficialImportFooter';
export { OfficialUpdateContainer, type OfficialUpdateContainerProps } from './screens/OfficialUpdateContainer';
export { OfficialUpdateButton, type OfficialUpdateButtonProps } from './components/OfficialUpdateButton';
export { PendingChangeCard, type PendingChangeCardProps } from './components/PendingChangeCard';
export { ResultRow, type ResultRowProps } from './components/ResultRow';
// Dev only: Metro drops this require from release bundles (issue 1040).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would bundle the gallery in release builds
export const galleryEntries: GalleryEntry[] = __DEV__ ? (require('./gallery') as typeof import('./gallery')).galleryEntries : [];
export { ConfirmPersonContainer, type ConfirmPersonContainerProps } from './screens/ConfirmPersonContainer';
export { TournamentImportContainer, type TournamentImportContainerProps } from './screens/TournamentImportContainer';
export { ConfirmPersonScreen, type ConfirmPersonScreenProps, type ConfirmPersonView } from './screens/ConfirmPersonScreen';
export {
  createInMemoryOfficialSearchRepository,
  createSupabaseImportSourcesRepository,
  createSupabaseOfficialSearchRepository,
  refreshTournaments,
  type TournamentTarget,
  type ImportSource,
  type ImportSourcesRepository,
  type OfficialSearchRepository,
  type SearchCandidate,
  type SearchFailure,
  type SearchOutcome,
  type TournamentCandidate,
} from './data/officialSearch';
export { useImportSources } from './data/useImportSources';
export { createPowerSyncTournamentCatalogRepository } from './data/powerSyncTournamentCatalogRepository';
export {
  createInMemoryTournamentCatalogRepository,
  groupTournaments,
  isRealDateKey,
  type TournamentCatalogEntry,
  type TournamentCatalogRepository,
  type TournamentFilter,
  type TournamentGroup,
} from './data/tournamentCatalog';
