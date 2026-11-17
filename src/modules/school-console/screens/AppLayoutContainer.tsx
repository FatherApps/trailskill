import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { NavBar, StateView, type NavBarItem } from '../../../core/ui';
import {
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createPowerSyncOwnAuthorizationEvidence,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  createSupabaseCoachInvitationAcceptance,
  createSupabaseInvitationRepository,
  createSupabaseProfileEvidenceRepository,
  ExistingAccountSheet,
  ProviderRegistrationContainer,
  providerAccountOf,
  ResumeRegistration,
  useFinishRegistration,
  useAcceptCoachInvitations,
  useOwnLandingEvidence,
  usePendingInvitations,
  useProfileGate,
  useSignOut,
  type RegistrationStep,
} from '../../accounts';
import { athleteProfileHref, createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../athletes';
import { createPowerSyncFamilyMeasurementRepository, useFamilyTimingAtList, useMoveLocalFamilyTimes } from '../../family-timing';
import { createPowerSyncStaffSchoolRepository } from '../data/staffSchools';
import { useStaffSchool } from '../data/useAdminSchool';

// The router of the route file, as much of it as the layout uses: the module never imports expo-router.
export type LayoutRouter = {
  replace(href: string): void;
  navigate(href: string): void;
};

export type AppLayoutContainerProps = {
  router: LayoutRouter;
  // The route segments of the screen in view, to know which tab is active.
  segments: string[];
  // The navigator of the route file, drawn once the account has a profile.
  stack: ReactNode;
};

// Built on first use, not when the file is imported, so importing the module has no side effects and a test replaces what it needs.
let built: ReturnType<typeof buildRepositories> | undefined;
function repositories() {
  return (built ??= buildRepositories());
}
function buildRepositories() {
  return {
    staffSchools: createPowerSyncStaffSchoolRepository(),
    managedAthletes: createPowerSyncManagedAthleteRepository(),
    schoolAthletes: createPowerSyncSchoolAthleteRepository(),
    drafts: createSecureStoreRegistrationDraftRepository(),
    profiles: createSupabaseAdultProfileRepository(),
    managedProfiles: createPowerSyncManagedAthleteProfileRepository(
      createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository()),
    ),
    profileEvidence: createSupabaseProfileEvidenceRepository(),
    hasOwnAuthorizations: createPowerSyncOwnAuthorizationEvidence(),
    coachInvitations: createSupabaseCoachInvitationAcceptance(),
    familyMeasurements: createPowerSyncFamilyMeasurementRepository(),
    invitation: { pending: createSecureStorePendingInvitationRepository(), invitations: createSupabaseInvitationRepository() },
  };
}

type Destination = 'home' | 'history' | 'marks' | 'my_times' | 'athletes' | 'settings';

// Only the destinations that have a screen, in the order of the bar: Deportistas first, since everything is entered after choosing the swimmer (issue 1069). "Entreno" is reached from "Lo próximo" on Inicio.
const home: NavBarItem & { id: Destination } = {
  id: 'home',
  label: t('home.nav.home'),
  icon: 'home',
};
const history: NavBarItem & { id: Destination } = {
  id: 'history',
  label: t('home.nav.history'),
  icon: 'timeline',
};
const marks: NavBarItem & { id: Destination } = {
  id: 'marks',
  label: t('home.nav.marks'),
  icon: 'emoji_events',
};
const athletes: NavBarItem & { id: Destination } = {
  id: 'athletes',
  label: t('home.nav.athletes'),
  icon: 'group',
};
// "Mis tiempos" and "Ajustes" were buttons on Inicio; the bar has them too, asked by the product owner in issue 999.
const myTimes: NavBarItem & { id: Destination } = {
  id: 'my_times',
  label: t('home.nav.my_times'),
  icon: 'timer',
};
const settings: NavBarItem & { id: Destination } = {
  id: 'settings',
  label: t('home.nav.settings'),
  icon: 'settings',
};
const familyItems = [athletes, home, history, marks, myTimes, settings];
// Until the account screen (issue 778) takes sign-out and authorizations out of "Mis deportistas", the adult keeps Deportistas to reach them.
const adultItems = familyItems;

// Route segments of the destinations: "/home", "/marks", "/family-timing", "/settings", "/athletes" and "/athletes/[id]" (the profile). Every other route,
// the registration flows included, has no tab and no bar; a static route added under /athletes is not a profile.
function destinationOf(segments: string[]): Destination | '' {
  const [, first, second, ...rest] = segments;
  if (rest.length > 0) return '';
  if (first === 'athletes') return second === undefined ? 'athletes' : second === '[id]' ? 'history' : '';
  if (second !== undefined) return '';
  if (first === 'family-timing') return 'my_times';
  return first === 'home' || first === 'marks' || first === 'settings' ? first : '';
}

// The floating phone bar of guardians and adult athletes. School staff and tablets use other navigation. Only the width
// and the route are checked here: the lookups live in the child, so a tablet or a route without a tab never runs them.
function PhoneNavBar({ router, segments }: Pick<AppLayoutContainerProps, 'router' | 'segments'>) {
  const { width } = useWindowDimensions();
  const { breakpoint } = useTheme();
  const destination = destinationOf(segments);
  // In "Mis tiempos" the bar shows only on its list, never while a time is measured, edited or sent.
  const familyTimingAtList = useFamilyTimingAtList();
  if (width >= breakpoint['bp-medium'] || !destination || (destination === 'my_times' && !familyTimingAtList)) return null;
  return <PhoneNavBarContent router={router} destination={destination} />;
}

function PhoneNavBarContent({ router, destination }: { router: LayoutRouter; destination: Destination }) {
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();
  const userId = session?.user.id;
  const { staffSchools, managedAthletes, schoolAthletes, hasOwnAuthorizations } = repositories();
  const staff = useStaffSchool(staffSchools, userId, lastSyncedAt?.getTime());
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, userId, lastSyncedAt?.getTime());
  const own = useOwnLandingEvidence(managedAthletes, hasOwnAuthorizations, userId, lastSyncedAt?.getTime());
  // shortcut: before the first sync the memberships of a coach or admin may not be on the device and look like a guardian, so the bar waits for the first sync.
  // A failed lookup ('error') keeps the bar, as it did when it counted as 'denied'; any other state hides it.
  const showsBar = lastSyncedAt != null && (staff.status === 'denied' || staff.status === 'error');
  // The bar waits for the device's answer, so a guardian never sees the adult's bar for a moment.
  if (!showsBar || own === 'loading') return null;

  // The same rule as the landing: the only athlete the person manages is their own.
  const adult = own.selfAthleteId != null && own.managedCount === 1;

  // The design says only "Historial = perfil": with one athlete it opens that profile, with several the person picks one.
  const only = managed.status === 'ready' && managed.athletes.length === 1 ? managed.athletes[0] : undefined;
  const href: Record<Destination, string> = {
    athletes: '/athletes',
    home: '/home',
    marks: '/marks',
    my_times: '/family-timing',
    settings: '/settings',
    history: only ? athleteProfileHref(only.id, [only.firstName, only.lastName].filter(Boolean).join(' ')) : '/athletes',
  };
  return (
    <NavBar
      labelPlacement="below"
      items={adult ? adultItems : familyItems}
      activeId={destination}
      onSelect={(id) => router.navigate(href[id as Destination])}
    />
  );
}

// A membership, a managed athlete or an own authorization already on the device: the proof that works with no signal.
async function hasLocalProfile(userId: string) {
  const { staffSchools, managedAthletes, hasOwnAuthorizations } = repositories();
  return (
    (await staffSchools.listStaffSchools(userId)).length > 0 ||
    (await managedAthletes.listManagedAthleteIds(userId)).length > 0 ||
    (await hasOwnAuthorizations(userId))
  );
}

// A session with no profile goes to the registration steps, not to the app. The person who already uses the app is let in by what the
// device holds, so the server is asked only the first time on a phone; with no signal then, it waits instead of guessing.
export function AppLayoutContainer({ router, segments, stack }: AppLayoutContainerProps) {
  const { drafts, profileEvidence, coachInvitations } = repositories();
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();
  const { colors, space } = useTheme();
  const gate = useProfileGate({
    userId: session?.user.id,
    email: session?.user.email,
    drafts,
    localReady: lastSyncedAt != null,
    hasLocalProfile,
    evidence: profileEvidence,
    // A coach invited by a school lands as staff on the first sign-in, before the registration is offered.
    acceptCoachInvitations: coachInvitations.accept, // Stable: the gate checks again whenever it changes.
  });
  if (gate.status === 'ready') return <AppShell router={router} segments={segments} stack={stack} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      {gate.status === 'register' && session ? (
        <Registration user={session.user} onSaved={gate.recheck} />
      ) : (
        <View style={{ flex: 1, padding: space[4], justifyContent: 'center' }}>
          {gate.status === 'unreachable' ? (
            <StateView
              kind="offline"
              title={t('accounts.failure.offline_title')}
              message={t('accounts.profile_check.offline_message')}
              action={{ label: t('sync.retry'), onPress: gate.recheck }}
            />
          ) : (
            <StateView kind="loading" />
          )}
        </View>
      )}
    </View>
  );
}

// The registration steps of a session with no profile. Back from the first step leaves the registration, and the session with it: it is the
// sign-out button's flow (the unsent-records warning, the failure message), and the draft goes too, so the next person starts clean.
function Registration({ user, onSaved }: { user: Parameters<typeof providerAccountOf>[0]; onSaved: () => void }) {
  const { drafts, invitation } = repositories();
  const { signOut, failed, sheet } = useSignOut(drafts, invitation.pending);
  return (
    <>
      <ProviderRegistrationContainer
        account={providerAccountOf(user)}
        drafts={drafts}
        invitations={invitation.invitations}
        onSaved={onSaved}
        onBack={() => void signOut()}
        exitFailed={failed}
      />
      {sheet}
    </>
  );
}

function AppShell({ router, segments, stack }: AppLayoutContainerProps) {
  const { drafts, profiles, managedProfiles, invitation, coachInvitations, familyMeasurements } = repositories();
  const { session, signOut } = useSession();
  // Stable: useFinishRegistration runs again whenever it changes.
  const openNext = useCallback((step: RegistrationStep) => router.replace(step === 'add_athletes' ? '/athletes/add' : '/athletes/authorizations'), [router]);
  // A person who just registered gets the profile typed in the draft stored once the account exists; a guardian goes on to add the athletes and an adult to the authorizations.
  const offer = useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles, managedProfiles, openNext, invitation);
  // The school invitation of an athlete is accepted once the athlete reached the server, so it is tried again after each sync.
  const { lastSyncedAt } = useGlobalSyncSummary();
  usePendingInvitations(session?.user.id, invitation.pending, invitation.invitations, lastSyncedAt?.getTime());
  // A person who already had a profile and was invited as coach later gets the membership here.
  useAcceptCoachInvitations(session?.user.id, coachInvitations);
  // "Mis tiempos" kept only on this phone before they synced move to the server, so signing out no longer loses them; a phone copy is removed after a sync confirms its upload.
  useMoveLocalFamilyTimes(familyMeasurements, session?.user.id, lastSyncedAt?.getTime());
  const { colors, space } = useTheme();
  // A draft typed here and never confirmed by a code is offered once the person is in with the same email.
  if (offer && !('existing' in offer)) {
    return (
      <View
        style={{
          flex: 1,
          padding: space[4],
          justifyContent: 'center',
          backgroundColor: colors['surface-0'],
        }}
      >
        <ResumeRegistration email={offer.email} onResume={offer.resume} onRestart={offer.startOver} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {stack}
      {/* The bar floats over the screen: it takes no band of its own, and the content shows around it. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <PhoneNavBar router={router} segments={segments} />
      </View>
      {/* The code already checked out (the session is open) and the account had a profile: tell the person instead of leaving them still. */}
      {offer && 'existing' in offer && <ExistingAccountSheet email={offer.email} signOut={signOut} onClose={offer.dismiss} />}
    </View>
  );
}
