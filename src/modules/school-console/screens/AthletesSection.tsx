import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Share } from 'react-native';

import { t } from '../../../core/i18n';
import type { SyncConnection } from '../../../core/sync';
import type { AthleteAvatarSlot } from '../../../core/ui';
import '../i18n';
import { avatarOf } from '../components/athleteAvatar';
import type { AdultDirectoryRepository, Guardian, InvitationRepository } from '../../accounts';
import type { AthleteRegistrationRepository, AthleteSchoolEndRepository } from '../../athletes';
import type { AthleteBest, AthleteFilterId, AthleteRow, CategoryChoice } from '../components/athleteTypes';
import { personalBestLabel } from '../components/eventLabel';
import { formatDate, localDate } from '../components/formatDate';
import type { CategoriesRepository, Category } from '../data/categories';
import type { GuardianRecordsRepository, GuardianSharingRepository } from '../data/guardianSharing';
import { athleteIndicators, filterAthletes, filterOptions, startOfWeek } from '../data/athletesList';
import type { SchoolGroup, SchoolStructureRepository } from '../data/schoolStructure';
import { CONSOLE_BEST_EVENT, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { RegisterAthleteForm } from '../components/RegisterAthleteForm';
import { AthletesScreen, type AthletesContent, type AthletesView } from './AthletesScreen';
import type { ConsoleSectionProps } from './ConsoleScreen';
import { SwimmerSharingSection } from './GuardianSharingSection';

export type AthletesSectionProps = ConsoleSectionProps & {
  // Injected by the route (this module cannot read show_photo or the photo): the athletes' avatar with their photo. Absent: the initials.
  Avatar?: AthleteAvatarSlot;
  schoolId: string;
  repository: ConsoleAthletesRepository;
  // Without it the detail shows the category but cannot change it.
  categories?: CategoriesRepository;
  // Without it the detail shows no guardian.
  guardians?: Pick<AdultDirectoryRepository, 'listGuardians'>;
  // Without it the detail has no controls for what the guardian sees.
  sharing?: { repository: GuardianSharingRepository; records?: GuardianRecordsRepository };
  // Without it the detail has no «Dar de baja a un nadador». Only the school admin console passes it; the server checks the role anyway.
  swimmerEnd?: Pick<AthleteSchoolEndRepository, 'endLink'>;
  // Inviting a family needs both: the school's groups (an invitation belongs to one) and the invitations. Without either the button is not shown.
  structure?: Pick<SchoolStructureRepository, 'listGroups'>;
  invitations?: Pick<InvitationRepository, 'create'>;
  // Registering a swimmer who has no account: without it the header has no «Dar de alta». Only the school admin console passes it; the server checks the role anyway.
  // `newId` makes the id of the swimmer on the device (one per opening of the sheet, so a retry never creates a second swimmer).
  registration?: { repository: Pick<AthleteRegistrationRepository, 'register'>; newId: () => string };
  // Opens the system share sheet with the invitation message; replaced in tests.
  share?: (message: string) => Promise<unknown>;
  // The list is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  // 'connecting' is not 'offline': PowerSync is still reaching the backend, so nothing says the device lacks a network yet.
  connection: SyncConnection;
  // The clock. A stable function: the list is read again when it changes.
  now?: () => Date;
};

type Loaded = { athletes: ConsoleAthlete[]; measurementsThisWeek: number };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; attempt: number; result: Loaded | 'error' };
type Filters = Partial<Record<AthleteFilterId, string>>;

// The values of the guardians that have one, in order, joined; null when none does.
const joined = (values: (string | null)[]) => values.filter((value) => value !== null).join(', ') || null;

// A guardian without a profile adds nothing. Contacts keep the order of the names, with the no-data text in place of a missing
// one, so a contact is never read as belonging to another guardian; when none has a contact the detail says no data once.
const guardianDetail = (list: Guardian[], noData: string) => {
  const named = list.filter((g) => g.name !== null);
  return {
    name: joined(named.map((g) => g.name)),
    contact: named.some((g) => g.contact !== null) ? named.map((g) => g.contact ?? noData).join(', ') : null,
  };
};

const defaultNow = () => new Date();
const defaultShare = (message: string) => Share.share({ message });

const MINUTE_MS = 60_000;

const END_ERRORS = ['not_allowed', 'not_enrolled'];
// The message of a failed baja: the repository's own error code when it has a text, a generic one otherwise (offline included).
const endError = (error: unknown) => {
  const code = error instanceof Error && END_ERRORS.includes(error.message) ? error.message : 'other';
  return t(`schoolConsole.detail.end_error.${code}`);
};

const ASSIGN_ERRORS = ['category_inactive', 'category_wrong_school', 'category_missing', 'athlete_school_missing'];
// The message of a failed assignment: the repository's own error code when it has a text, a generic one otherwise.
const assignError = (error: unknown) => {
  const code = error instanceof Error && ASSIGN_ERRORS.includes(error.message) ? error.message : 'other';
  return t(`schoolConsole.detail.category_error.${code}`);
};

// What the admin can pick: the active categories, the one the athlete has even if inactive, and none.
function categoryOptions(list: Category[], current: string | null): CategoryChoice['options'] {
  return [
    ...list
      .filter((category) => category.active || category.id === current)
      .map((category) => ({
        id: category.id,
        label: category.active ? category.name : t('schoolConsole.detail.inactive_option', { name: category.name }),
      })),
    { id: null, label: t('schoolConsole.detail.no_category') },
  ];
}

function toRow(athlete: ConsoleAthlete, Avatar: AthleteAvatarSlot | undefined): AthleteRow {
  const noData = t('schoolConsole.common.no_data');
  return {
    id: athlete.id,
    name: athlete.name,
    initials: athlete.initials,
    color: athlete.color,
    category: athlete.category ?? noData,
    group: athlete.groups.length > 0 ? athlete.groups.join(', ') : noData,
    // The coach column is not filled from the profiles yet.
    coach: null,
    authorization: athlete.authorization,
    bestTime: athlete.bestTime,
    avatar: avatarOf(Avatar, athlete),
  };
}

// The athletes of the school, read from the local database. Owns the search, the filters and the open athlete.
export function AthletesSection({
  Avatar,
  width,
  schoolName,
  onNavigate,
  schoolId,
  repository,
  categories,
  guardians,
  sharing,
  swimmerEnd,
  structure,
  invitations,
  registration,
  share = defaultShare,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
}: AthletesSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sheetId, setSheetId] = useState<AthleteFilterId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  // Bumped after each assignment so the list and the tags show the new category.
  const [version, setVersion] = useState(0);
  const [assignFailure, setAssignFailure] = useState<{ athleteId: string; message: string }>();
  const [endFailure, setEndFailure] = useState<{ athleteId: string; message: string }>();
  // A ref, not state: a second confirmation can arrive before a re-render shows the first is running.
  const ending = useRef(false);
  const [bests, setBests] = useState<{ athleteId: string; bests: AthleteBest[]; failed: boolean }>();
  const [guardianList, setGuardianList] = useState<{ athleteId: string; guardians: Guardian[] }>();

  // Stored with the school they belong to, so another school never inherits the groups to pick from or the error.
  const [picking, setPicking] = useState<{ schoolId: string; groups: SchoolGroup[] } | null>(null);
  const [failure, setFailure] = useState<{ schoolId: string; message: string } | null>(null);
  const pickingGroup = picking?.schoolId === schoolId ? picking.groups : null;
  const inviteError = failure?.schoolId === schoolId ? failure.message : null;
  const setInviteError = (message: string | null) => setFailure(message === null ? null : { schoolId, message });
  // A ref, not state: a second press can arrive before a re-render shows the first is running.
  const inviting = useRef(false);
  // The swimmer id of the open «Dar de alta» sheet, made when it opens; the school it belongs to is kept so another school never inherits it.
  const [registering, setRegistering] = useState<{ schoolId: string; athleteId: string } | null>(null);
  const registeringHere = registering?.schoolId === schoolId ? registering : null;

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, attempt, result });
    repository
      .listAthletes(schoolId)
      .then(async (athletes) =>
        settle({ athletes, measurementsThisWeek: await repository.countMeasurementsSince(athletes.map((a) => a.id), startOfWeek(now())) }),
      )
      .catch(() => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, schoolId, refreshKey, attempt, now, version]);

  useEffect(() => {
    if (!categories) return;
    let active = true;
    categories.list(schoolId).then((list) => active && setCategoryList(list), () => active && setCategoryList([]));
    return () => {
      active = false;
    };
  }, [categories, schoolId, refreshKey, version]);

  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    const settle = (list: AthleteBest[], failed = false) => active && setBests({ athleteId: selectedId, bests: list, failed });
    repository.listBests(selectedId).then((list) => settle(list), () => settle([], true));
    return () => {
      active = false;
    };
  }, [repository, selectedId, refreshKey]);

  useEffect(() => {
    if (selectedId === null || !guardians) return;
    let active = true;
    const settle = (list: Guardian[]) => active && setGuardianList({ athleteId: selectedId, guardians: list });
    guardians.listGuardians(selectedId).then(settle, () => settle([]));
    return () => {
      active = false;
    };
  }, [guardians, selectedId, refreshKey]);

  const loaded = answer?.schoolId === schoolId && answer.attempt === attempt ? answer.result : undefined;
  const athletes = loaded === 'error' || loaded === undefined ? undefined : loaded.athletes;
  const options = useMemo(() => (athletes ? filterOptions(athletes) : undefined), [athletes]);
  const bestLabel = personalBestLabel(CONSOLE_BEST_EVENT.stroke, CONSOLE_BEST_EVENT.distance, CONSOLE_BEST_EVENT.pool);

  let view: AthletesView;
  if (loaded === undefined) {
    view = { kind: 'loading' };
  } else if (loaded === 'error') {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (loaded.athletes.length === 0) {
    // Never synced and still not connected: nothing is stored yet, and the list fills in when the first sync arrives.
    // Never synced: 'connecting' is not 'offline', the first sync is already on its way.
    view =
      lastSyncedAt !== null || connection === 'connected'
        ? { kind: 'empty' }
        : connection === 'connecting'
          ? { kind: 'connecting-empty' }
          : { kind: 'offline-empty' };
  } else {
    const selected = loaded.athletes.find((a) => a.id === selectedId);
    // Until the athlete's own guardians arrive there are none, never another athlete's.
    const guardianNow = selected && guardianList?.athleteId === selected.id ? guardianList.guardians : [];
    const content: AthletesContent = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      indicators: athleteIndicators(loaded.athletes, loaded.measurementsThisWeek),
      query,
      filters: Object.fromEntries(
        Object.entries(filters).map(([id, value]) => [
          id,
          options?.[id as AthleteFilterId].find((o) => o.id === value)?.label ?? t('schoolConsole.common.no_data'),
        ]),
      ),
      athletes: filterAthletes(loaded.athletes, query, filters).map((athlete) => toRow(athlete, Avatar)),
      bestLabel,
      selectedId,
      detail: selected
        ? {
            id: selected.id,
            name: selected.name,
            avatar: avatarOf(Avatar, selected),
            category: selected.category ?? t('schoolConsole.common.no_data'),
            authorization: selected.authorization,
            guardian: guardianDetail(guardianNow, t('schoolConsole.common.no_data')),
            // Until the athlete's own bests arrive the list is empty, never another athlete's.
            bests: bests?.athleteId === selected.id ? bests.bests : [],
            bestsError: bests?.athleteId === selected.id && bests.failed,
            guardianSharing: sharing && (
              <SwimmerSharingSection
                // A new swimmer remounts it, so the switch and the records of the previous one never show.
                key={selected.id}
                repository={sharing.repository}
                records={sharing.records}
                athleteId={selected.id}
                schoolId={schoolId}
                connection={connection}
                refreshKey={refreshKey}
              />
            ),
            endLink: swimmerEnd && {
              error: endFailure?.athleteId === selected.id ? endFailure.message : null,
              onConfirm: () => {
                if (ending.current) return;
                ending.current = true;
                swimmerEnd
                  .endLink(selected.id, schoolId)
                  .then(
                    () => {
                      setEndFailure(undefined);
                      // The swimmer leaves the list with the next sync: the open detail closes and the list is read again.
                      setSelectedId(null);
                      setVersion((n) => n + 1);
                    },
                    (error) => setEndFailure({ athleteId: selected.id, message: endError(error) }),
                  )
                  .finally(() => {
                    ending.current = false;
                  });
              },
            },
            categoryChoice: categories && {
              options: categoryOptions(categoryList, selected.categoryId),
              selectedId: selected.categoryId,
              error: assignFailure?.athleteId === selected.id ? assignFailure.message : null,
              onChoose: (categoryId) =>
                categories.assignAthlete(selected.id, schoolId, categoryId).then(
                  () => {
                    setAssignFailure(undefined);
                    setVersion((n) => n + 1);
                  },
                  (error) => setAssignFailure({ athleteId: selected.id, message: assignError(error) }),
                ),
            },
          }
        : null,
    };
    // Without a connection the list is what the device stored; with no sync date the banner leaves the date out.
    view = connection !== 'offline' ? { kind: 'data', content } : { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content };
  }

  // The school invites, the family creates the profile. The invitation needs a group: the only one of the school, or the one the admin picks.
  const invite = async (chosenGroupId?: string) => {
    if (!structure || !invitations || inviting.current) return;
    inviting.current = true;
    setInviteError(null);
    try {
      let groupId = chosenGroupId;
      if (groupId === undefined) {
        let groups: SchoolGroup[];
        try {
          groups = await structure.listGroups(schoolId);
        } catch {
          return setInviteError(t('schoolConsole.screen.invite_groups_error'));
        }
        if (groups.length === 0) return setInviteError(t('schoolConsole.screen.invite_no_groups'));
        if (groups.length > 1) return setPicking({ schoolId, groups });
        groupId = groups[0].id;
      }
      setPicking(null);
      let message: string;
      try {
        const invitation = await invitations.create({ schoolId, groupId });
        // A date that cannot be read drops the expiry sentence instead of leaving it blank.
        const date = formatDate(localDate(new Date(invitation.expiresAt)), 'long');
        message = t(date === null ? 'schoolConsole.screen.invite_message_no_date' : 'schoolConsole.screen.invite_message', {
          school: schoolName,
          link: Linking.createURL(`invite/${invitation.token}`),
          date: date ?? '',
        });
      } catch {
        return setInviteError(t('schoolConsole.screen.invite_error'));
      }
      // Closing the share sheet without sending is the admin's choice, not a failure: the invitation stays valid.
      await share(message).catch(() => undefined);
    } finally {
      inviting.current = false;
    }
  };

  return (
    <AthletesScreen
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      onInvite={structure && invitations ? () => void invite() : undefined}
      onRegister={registration ? () => setRegistering({ schoolId, athleteId: registration.newId() }) : undefined}
      registerSheet={
        registration && registeringHere
          ? {
              content: (
                <RegisterAthleteForm
                  schoolName={schoolName}
                  offline={connection === 'offline'}
                  share={share}
                  onSubmit={async ({ firstName, lastName }) => {
                    const claim = await registration.repository.register({
                      athleteId: registeringHere.athleteId,
                      schoolId,
                      firstName,
                      lastName,
                      guardianAuthorizationCollected: true,
                    });
                    // The list shows the swimmer once the sync brings it.
                    return { link: Linking.createURL(`claim/${claim.token}`), expiresAt: claim.expiresAt };
                  }}
                  onClose={() => setRegistering(null)}
                />
              ),
              onClose: () => setRegistering(null),
            }
          : undefined
      }
      inviteError={inviteError}
      inviteGroupSheet={
        pickingGroup
          ? {
              options: pickingGroup.map((group) => ({ id: group.id, label: group.name })),
              onChoose: (groupId) => void invite(groupId),
              onClose: () => setPicking(null),
            }
          : undefined
      }
      onQueryChange={setQuery}
      onFilterPress={(id) => {
        if (filters[id] === undefined) return setSheetId(id);
        setFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
      }}
      onSelect={setSelectedId}
      onCloseDetail={() => setSelectedId(null)}
      onClearFilters={() => {
        setQuery('');
        setFilters({});
      }}
      filterSheet={
        sheetId && options
          ? {
              id: sheetId,
              options: options[sheetId],
              selectedId: filters[sheetId],
              onChoose: (optionId) => {
                setFilters((current) => ({ ...current, [sheetId]: optionId }));
                setSheetId(null);
              },
              onClose: () => setSheetId(null),
            }
          : undefined
      }
    />
  );
}
