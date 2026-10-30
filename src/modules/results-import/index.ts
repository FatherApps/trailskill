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
export { OfficialUpdateContainer, type OfficialUpdateContainerProps } from './screens/OfficialUpdateContainer';
export { OfficialUpdateButton, type OfficialUpdateButtonProps } from './components/OfficialUpdateButton';
export { PendingChangeCard, type PendingChangeCardProps } from './components/PendingChangeCard';
export { ResultRow, type ResultRowProps } from './components/ResultRow';
export { galleryEntries } from './gallery';
export { ConfirmPersonContainer, formatRetryTime, type ConfirmPersonContainerProps } from './screens/ConfirmPersonContainer';
export { ConfirmPersonScreen, type ConfirmPersonScreenProps, type ConfirmPersonView } from './screens/ConfirmPersonScreen';
export {
  createInMemoryOfficialSearchRepository,
  createSupabaseImportSourcesRepository,
  createSupabaseOfficialSearchRepository,
  type ImportSource,
  type ImportSourcesRepository,
  type OfficialSearchRepository,
  type SearchCandidate,
  type SearchFailure,
  type SearchOutcome,
} from './data/officialSearch';
export { useImportSources } from './data/useImportSources';
