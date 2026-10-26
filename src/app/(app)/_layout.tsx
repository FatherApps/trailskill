import { Stack, usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { t } from '../../core/i18n';
import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { NavBar, type NavBarItem } from '../../core/ui';
import {
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  createSupabaseInvitationRepository,
  ResumeRegistration,
  useFinishRegistration,
  usePendingInvitations,
  type RegistrationStep,
} from '../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useStaffSchool } from '../../modules/school-console';

const staffSchools = createPowerSyncStaffSchoolRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const drafts = createSecureStoreRegistrationDraftRepository();
const profiles = createSupabaseAdultProfileRepository();
const managedProfiles = createPowerSyncManagedAthleteProfileRepository(
  createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository()),
);
const invitation = { pending: createSecureStorePendingInvitationRepository(), invitations: createSupabaseInvitationRepository() };

type Destination = 'athletes' | 'today' | 'history';

const navItems: (NavBarItem & { id: Destination })[] = [
  { id: 'athletes', label: t('home.nav.athletes'), icon: 'group' },
  { id: 'today', label: t('home.nav.today'), icon: 'sports' },
  { id: 'history', label: t('home.nav.history'), icon: 'leaderboard' },
];

// "/athletes/<id>" is a profile; the other routes under /athletes are the registration flows, which have no tab.
const profileRoute = /^\/athletes\/(?!add$|authorizations$)[^/]+$/;

function destinationOf(pathname: string): Destination | '' {
  if (pathname === '/athletes') return 'athletes';
  if (pathname === '/today') return 'today';
  return profileRoute.test(pathname) ? 'history' : '';
}

// The floating phone bar of guardians and adult athletes. School staff and tablets use other navigation, so a lookup
// that has not answered yet shows nothing rather than a bar that would flash away.
function PhoneNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const { breakpoint } = useTheme();
  const { lastSyncedAt } = useGlobalSyncSummary();
  const userId = session?.user.id;
  const staff = useStaffSchool(staffSchools, userId, lastSyncedAt?.getTime());
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, userId, lastSyncedAt?.getTime());
  if (width >= breakpoint['bp-medium'] || staff.status !== 'denied') return null;

  // The design says only "Historial = perfil": with one athlete it opens that profile, with several the person picks one.
  const only = managed.status === 'ready' && managed.athletes.length === 1 ? managed.athletes[0] : undefined;
  const href: Record<Destination, string> = {
    athletes: '/athletes',
    today: '/today',
    history: only ? `/athletes/${only.id}` : '/athletes',
  };
  return <NavBar items={navItems} activeId={destinationOf(pathname)} onSelect={(id) => router.navigate(href[id as Destination])} />;
}

export default function Layout() {
  const router = useRouter();
  const { session } = useSession();
  // Stable: useFinishRegistration runs again whenever it changes.
  const openNext = useCallback(
    (step: RegistrationStep) => router.replace(step === 'add_athletes' ? '/athletes/add' : '/athletes/authorizations'),
    [router],
  );
  // A person who just registered gets the profile typed in the draft stored once the account exists; a guardian goes on to add the athletes and an adult to the authorizations.
  const offer = useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles, managedProfiles, openNext, invitation);
  // The school invitation of an athlete is accepted once the athlete reached the server, so it is tried again after each sync.
  const { lastSyncedAt } = useGlobalSyncSummary();
  usePendingInvitations(session?.user.id, invitation.pending, invitation.invitations, lastSyncedAt?.getTime());
  const { colors, space } = useTheme();
  // A draft typed here and never confirmed by a code is offered once the person is in with the same email.
  if (offer) {
    return (
      <View style={{ flex: 1, padding: space[4], justifyContent: 'center', backgroundColor: colors['surface-0'] }}>
        <ResumeRegistration email={offer.email} onResume={offer.resume} onRestart={offer.startOver} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <PhoneNavBar />
    </View>
  );
}
