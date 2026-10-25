import './i18n';

export { AccountDetailsScreen, type AccountDetailsField, type AccountDetailsScreenProps } from './screens/AccountDetailsScreen';
export { SignInScreen, type SignInField, type SignInScreenProps } from './screens/SignInScreen';
export { AccountDetailsContainer, type AccountDetailsContainerProps } from './screens/AccountDetailsContainer';
export { WhoSwimsContainer, type WhoSwimsContainerProps } from './screens/WhoSwimsContainer';
export { WhoSwimsScreen, type SwimmerChoice, type WhoSwimsScreenProps } from './screens/WhoSwimsScreen';
export { galleryEntries } from './gallery';
export {
  createInMemoryAuthorizationStatusRepository,
  createPowerSyncAuthorizationStatusRepository,
  type AuthorizationPurpose,
  type AuthorizationStatusRepository,
} from './data/authorizationStatus';
export {
  createInMemoryManagedAthleteRepository,
  createPowerSyncManagedAthleteRepository,
  type ManagedAthleteRepository,
  type ManagedAthleteRow,
} from './data/managedAthletes';
export {
  createInMemoryAdultProfileRepository,
  createSupabaseAdultProfileRepository,
  type AdultProfile,
  type AdultProfileRepository,
} from './data/adultProfiles';
export {
  createInMemoryRegistrationDraftRepository,
  createSecureStoreRegistrationDraftRepository,
  finishRegistration,
  useFinishRegistration,
  type RegistrationDraft,
  type RegistrationDraftRepository,
} from './data/registrationDraft';
