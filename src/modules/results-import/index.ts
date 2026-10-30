export type { ImportedResult, ImportedResultsRepository, PendingResultChange } from './data/importedResults';
export { createInMemoryImportedResultsRepository } from './data/inMemoryImportedResultsRepository';
export { createPowerSyncImportedResultsRepository } from './data/powerSyncImportedResultsRepository';
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
