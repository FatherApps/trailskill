export type { ImportedResult, ImportedResultsRepository, PendingResultChange } from './data/importedResults';
export { createInMemoryImportedResultsRepository } from './data/inMemoryImportedResultsRepository';
export { unconfirmedIdentity } from './data/officialResults';
export type {
  ChangeChoice,
  FoundResult,
  IdentityConfirmation,
  OfficialResultsError,
  OfficialResultsOutcome,
  OfficialResultsService,
  PendingChangeResolver,
} from './data/officialResults';
export { createOfficialUpdate, sortOutFound, updateButtonState } from './officialUpdate';
export type { CheckOutcome, FoundItem, ImportOutcome, UpdateButtonState } from './officialUpdate';
