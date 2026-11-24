import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../core/theme';
import { AthleteAvatar, Button, SyncStatus, type GalleryEntry } from '../../core/ui';
import { historyFixture as h, historyLongTextResults, historyResults, historyValidatedResults } from './__fixtures__/history';
import { marksFixture, marksLongPoolFixture, marksLongTextFixture } from './__fixtures__/marks';
import {
  progressChartMinutes,
  progressChartOneResult,
  progressChartResults,
  progressChartToday,
  progressChartTwoResults,
  progressChartWithoutTime,
} from './__fixtures__/progressChart';
import { recoveryCodesFixture, recoveryMainCodeFixture } from './__fixtures__/recoveryCodes';
import { relinkRequestsFixture, relinkRequestsLongTextFixture } from './__fixtures__/relink';
import { myAthletesFixture, myAthletesLongTextFixture } from './__fixtures__/myAthletes';
import { profileContentFixture, storedOnFixture } from './__fixtures__/screen';
import { photoCardFixture as pc, syntheticPhotoUri } from './__fixtures__/photoCard';
import { eventFixture as ev, personalBestFixture as pb, profileFixture as pf } from './__fixtures__/profile';
import { EventSelector, type EventValue } from './components/EventSelector';
import { AthleteNameForm, type AthleteNameFormProps } from './components/AthleteNameForm';
import { AthletePrivateDetailsForm, type AthletePrivateDetailsFormProps } from './components/AthletePrivateDetailsForm';
import { HistoryList } from './components/HistoryList';
import { ImportPrompt } from './components/ImportPrompt';
import { PersonalBest, type PersonalBestProps } from './components/PersonalBest';
import { PhotoCard, type PhotoCardProps } from './components/PhotoCard';
import { PhotoRemoveSheet, type PhotoRemoveSheetProps } from './components/PhotoRemoveSheet';
import { ProgressChart } from './components/ProgressChart';
import type { HistoryResult } from './components/HistoryList';
import { AthleteRecoveryCodeRow, type AthleteRecoveryCodeRowProps } from './components/AthleteRecoveryCodeRow';
import { AthleteResultSharingRow, type AthleteResultSharingRowProps } from './components/AthleteResultSharingRow';
import { ProfileHeader, type ProfileHeaderProps } from './components/ProfileHeader';
import { AthleteEditScreen } from './screens/AthleteEditScreen';
import { AthleteProfileScreen, type AthleteProfileContent, type AthleteProfileView } from './screens/AthleteProfileScreen';
import { MarksScreen, type MarksView } from './screens/MarksScreen';
import { RecoveryCodesReplacedScreen } from './screens/RecoveryCodesReplacedScreen';
import { RecoveryCodesScreen, type RecoveryCodesScreenProps } from './screens/RecoveryCodesScreen';
import { RelinkRequestScreen, type RelinkRequestScreenProps } from './screens/RelinkRequestScreen';
import { MyAthletesScreen, type MyAthletesView } from './screens/MyAthletesScreen';

// The preview box shrinks its children to their content; these components need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

const noop = () => {};

// A full screen needs a height of its own inside the preview box.
const ScreenFrame = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch', height: 760 }}>{children}</View>;

const recoveryScreenBase: RecoveryCodesScreenProps = {
  athleteName: 'Ana',
  mainCode: recoveryMainCodeFixture,
  recoveryCodes: recoveryCodesFixture,
  onCopy: noop,
  onDone: noop,
};
const recoveryRowBase: AthleteRecoveryCodeRowProps = { code: recoveryMainCodeFixture, revealed: false, online: true, onToggle: noop, onCopy: noop, onRegenerate: noop };

// Synthetic school names only.
const sharingRowBase: AthleteResultSharingRowProps = {
  schools: [
    { id: 'gallery-school-1', name: 'Escuela Uno', shared: true },
    { id: 'gallery-school-2', name: 'Escuela Dos', shared: false },
  ],
  onToggle: noop,
};

// The relink request: the key is never part of a fixture (a made-up shape stands in for what the person types).
const relinkBase: RelinkRequestScreenProps = {
  athleteId: 'a1',
  athleteName: 'Ana M.',
  keyValue: '',
  onChangeKey: noop,
  state: 'idle',
  requests: { kind: 'ready', requests: [] },
  onSubmit: noop,
  onBack: noop,
};

// The photo card as the profile shows it; the avatar is the one the container builds (the photo, or the initials).
const nameFormBase: AthleteNameFormProps = { firstName: 'Ana', lastName: 'Marin', onSave: noop };
// A fixed day, so the future-date state does not depend on the phone clock.
const detailsFormBase: AthletePrivateDetailsFormProps = { birthDate: null, gender: null, today: '2026-11-21', onSave: noop };
const detailsFormSaved: AthletePrivateDetailsFormProps = { ...detailsFormBase, birthDate: '2014-05-03', gender: 'F' };
const photoCardBase: PhotoCardProps = {
  state: 'none',
  avatar: <AthleteAvatar initials={pc.initials} colorIndex={3} size="lg" authorized />,
  onAuthorize: noop,
  onTake: noop,
  onChoose: noop,
};
const withPhoto = <AthleteAvatar initials={pc.initials} colorIndex={3} size="lg" photoUri={syntheticPhotoUri} authorized />;

// The sheet is a modal that covers the gallery, so each state opens it on demand.
function PhotoRemoveSheetPreview(props: Pick<PhotoRemoveSheetProps, 'reason' | 'failed'>) {
  const [visible, setVisible] = useState(false);
  const close = () => setVisible(false);

  return (
    <FullWidth>
      <Button variant="secondary" label="Mostrar la hoja" onPress={() => setVisible(true)} />
      <PhotoRemoveSheet {...props} visible={visible} onConfirm={close} onCancel={close} />
    </FullWidth>
  );
}

const headerBase: ProfileHeaderProps = {
  name: pf.name,
  color: 'athlete-3',
  onBack: noop,
  category: pf.category,
  schools: pf.schools.slice(0, 1),
  schoolId: pf.schools[0].id,
  authorization: 'valid',
  updatedMinutesAgo: 5,
};

// Holds the school, so tapping an option changes it in the gallery.
function ProfileHeaderPreview({ children, ...props }: ProfileHeaderProps) {
  const [schoolId, setSchoolId] = useState(props.schoolId);

  return (
    <FullWidth>
      <ProfileHeader {...props} schoolId={schoolId} onSchoolChange={setSchoolId}>
        {children}
      </ProfileHeader>
    </FullWidth>
  );
}

// Holds the selection, so tapping an option changes it in the gallery.
function EventSelectorPreview({ pools }: { pools: typeof ev.pools }) {
  const [value, setValue] = useState<EventValue>(ev.value);

  return (
    <FullWidth>
      <EventSelector events={ev.events} pools={pools} value={value} onChange={setValue} />
    </FullWidth>
  );
}

const personalBestBase: PersonalBestProps = {
  stroke: pb.stroke,
  distance: pb.distance,
  pool: pb.pool,
  best: pb.best,
  improvement: pb.improvement,
  kind: 'competition',
  date: pb.date,
};

const PersonalBestPreview = (props: PersonalBestProps) => (
  <FullWidth>
    <PersonalBest {...props} />
  </FullWidth>
);

// A fixed date, so the ranges of the gallery do not drift with the day it is opened.
const chartPreview = (results: HistoryResult[]) =>
  function ChartPreview() {
    return (
      <FullWidth>
        <ProgressChart results={results} today={progressChartToday} />
      </FullWidth>
    );
  };

const prompt = { athleteName: h.athleteName, onDismiss: noop, onRefresh: noop, onLearnMore: noop };

// Holds the event selection, so tapping an option changes it in the gallery. `view` picks the state to show.
function AthleteProfileScreenPreview({ view }: { view: (content: AthleteProfileContent) => AthleteProfileView }) {
  const [value, setValue] = useState<EventValue>(profileContentFixture.event.value);
  const content = { ...profileContentFixture, event: { ...profileContentFixture.event, value, onChange: setValue } };

  // The gallery page scrolls, so the list inside does not.
  return <AthleteProfileScreen name={pf.name} view={view(content)} scrollEnabled={false} onBack={noop} />;
}

const screenPreview = (view: (content: AthleteProfileContent) => AthleteProfileView) =>
  function ScreenPreview() {
    return <AthleteProfileScreenPreview view={view} />;
  };

// The preview box and the page padding narrow a screen to about 250 dp; marks are drawn at the full width of a phone instead,
// so a tag fits one line here as it does on the device (the box padding plus the gallery page padding).
function MarksPreview({ view }: { view: MarksView }) {
  const { space } = useTheme();
  return (
    <View style={{ alignSelf: 'stretch', marginHorizontal: -(space[4] + space[5]) }}>
      <MarksScreen view={view} onSelectAthlete={noop} onPoolChange={noop} scrollEnabled={false} />
    </View>
  );
}
const marksPreview = (view: MarksView) =>
  function MarksStatePreview() {
    return <MarksPreview view={view} />;
  };

const myAthletesPreview = (view: MyAthletesView) =>
  function MyAthletesPreview() {
    return <MyAthletesScreen view={view} onOpen={noop} onEdit={noop} onAdd={noop} scrollEnabled={false} />;
  };

const entry = (id: string, title: string, states: Record<string, () => ReactElement>): GalleryEntry => ({
  id,
  title,
  states,
});

export const galleryEntries: GalleryEntry[] = [
  entry('profileHeader', 'ProfileHeader', {
    'one-school': () => <ProfileHeaderPreview {...headerBase} />,
    'with-avatar': () => (
      <ProfileHeaderPreview {...headerBase} avatar={<AthleteAvatar initials="TR" colorIndex={3} size="lg" authorized={false} />} />
    ),
    'several-schools': () => <ProfileHeaderPreview {...headerBase} schools={pf.schools} />,
    'pending-authorization': () => <ProfileHeaderPreview {...headerBase} authorization="pending" />,
    'with-event-chips': () => (
      <ProfileHeaderPreview {...headerBase}>
        <EventSelectorPreview pools={ev.pools.slice(0, 1)} />
      </ProfileHeaderPreview>
    ),
    'no-sync-info': () => <ProfileHeaderPreview {...headerBase} updatedMinutesAgo={null} color="athlete-4" />,
    'long-text': () => (
      <ProfileHeaderPreview
        {...headerBase}
        name={pf.longName}
        category={pf.longCategory}
        schools={pf.longSchools}
        authorization="pending"
        updatedMinutesAgo={125}
      />
    ),
    // The long name, the long school names and the event chips together: the narrowest case for the ring behind the title (issue 851).
    'long-text-with-event-chips': () => (
      <ProfileHeaderPreview
        {...headerBase}
        name={pf.longName}
        category={pf.longCategory}
        schools={pf.longSchools}
        authorization="pending"
        updatedMinutesAgo={125}
      >
        <EventSelectorPreview pools={ev.pools} />
      </ProfileHeaderPreview>
    ),
  }),
  entry('eventSelector', 'EventSelector', {
    'one-pool': () => <EventSelectorPreview pools={ev.pools.slice(0, 1)} />,
    'two-pools': () => <EventSelectorPreview pools={ev.pools} />,
  }),
  entry('personalBest', 'PersonalBest', {
    'with-improvement': () => <PersonalBestPreview {...personalBestBase} />,
    'no-improvement': () => <PersonalBestPreview {...personalBestBase} improvement={undefined} />,
    missing: () => <PersonalBestPreview {...personalBestBase} best={null} kind={undefined} date={undefined} />,
    training: () => <PersonalBestPreview {...personalBestBase} kind="training" date={pb.trainingDate} />,
  }),
  {
    id: 'historyList',
    title: 'HistoryList',
    states: {
      mixed: () => <HistoryList scrollEnabled={false} results={historyResults} />,
      'long-text': () => <HistoryList scrollEnabled={false} results={historyLongTextResults} />,
      validated: () => <HistoryList scrollEnabled={false} results={historyValidatedResults} />,
    },
  },
  {
    id: 'progressChart',
    title: 'ProgressChart',
    states: {
      'many-results': chartPreview(progressChartResults),
      'two-results': chartPreview(progressChartTwoResults),
      'one-result': chartPreview(progressChartOneResult),
      empty: chartPreview([]),
      'completed-without-time': chartPreview(progressChartWithoutTime),
      'long-event': chartPreview(progressChartMinutes),
    },
  },
  {
    id: 'importPrompt',
    title: 'ImportPrompt',
    states: {
      'not-imported': () => <ImportPrompt {...prompt} sourceName={h.sourceName} imported={false} />,
      imported: () => <ImportPrompt {...prompt} sourceName={h.sourceName} imported />,
      // No provider configured: the component renders nothing.
      'no-source': () => <ImportPrompt {...prompt} imported={false} />,
    },
  },
  entry('photoCard', 'PhotoCard', {
    'no-photo': () => <PhotoCard {...photoCardBase} />,
    'with-photo': () => <PhotoCard {...photoCardBase} state="ready" avatar={withPhoto} status={<SyncStatus state="synced" />} onRemove={noop} />,
    // Chosen on this phone, not sent yet: the pill says where it is, and it can still be taken away.
    waiting: () => <PhotoCard {...photoCardBase} state="waiting" avatar={withPhoto} status={<SyncStatus state="on_device" message="Esperando señal para enviarse" />} onRemove={noop} />,
    unauthorized: () => <PhotoCard {...photoCardBase} state="unauthorized" />,
    saving: () => <PhotoCard {...photoCardBase} busy />,
    'camera-denied': () => <PhotoCard {...photoCardBase} notice="camera_denied" />,
    'remove-offline': () => <PhotoCard {...photoCardBase} state="ready" avatar={withPhoto} status={<SyncStatus state="synced" />} notice="remove_offline" onRemove={noop} />,
  }),
  entry('photoRemoveSheet', 'PhotoRemoveSheet', {
    manual: () => <PhotoRemoveSheetPreview reason="manual" />,
    withdrawn: () => <PhotoRemoveSheetPreview reason="withdrawn" />,
    failed: () => <PhotoRemoveSheetPreview reason="withdrawn" failed />,
  }),
  entry('athleteProfileScreen', 'AthleteProfileScreen', {
    'with-data': screenPreview((content) => ({ kind: 'data', content })),
    loading: screenPreview(() => ({ kind: 'loading' })),
    empty: screenPreview((content) => ({ kind: 'empty', content })),
    error: screenPreview(() => ({ kind: 'error', onRetry: noop })),
    'offline-with-data': screenPreview((content) => ({ kind: 'offline', storedOn: storedOnFixture, content })),
    'offline-no-data': screenPreview(() => ({ kind: 'offline-empty' })),
    denied: screenPreview(() => ({ kind: 'denied', onRequestAccess: noop })),
    'other-school-offline': screenPreview(() => ({ kind: 'other-school-offline' })),
    'with-import-prompt': screenPreview((content) => ({
      kind: 'data',
      content: { ...content, importPrompt: { ...prompt, sourceName: h.sourceName, imported: false } },
    })),
    // The owner's switch per school at the foot of the profile; without it (one school, no authorization, not the owner) the profile is 'with-data'.
    'with-result-sharing': screenPreview((content) => ({ kind: 'data', content: { ...content, resultSharing: <AthleteResultSharingRow {...sharingRowBase} /> } })),
  }),
  entry('myAthletesScreen', 'MyAthletesScreen', {
    'with-data': myAthletesPreview({ kind: 'data', athletes: myAthletesFixture }),
    'with-avatar': myAthletesPreview({
      kind: 'data',
      athletes: myAthletesFixture.map((card) => ({
        ...card,
        avatar: <AthleteAvatar initials={`${card.firstName.charAt(0)}${card.lastName.charAt(0)}`} colorIndex={Number(card.color.slice(-1)) as 1 | 2 | 3 | 4} size="lg" authorized={false} />,
      })),
    }),
    'long-text': myAthletesPreview({ kind: 'data', athletes: myAthletesLongTextFixture }),
    empty: myAthletesPreview({ kind: 'empty' }),
    loading: myAthletesPreview({ kind: 'loading' }),
  }),
  entry('athleteNameForm', 'AthleteNameForm', {
    unchanged: () => <AthleteNameForm {...nameFormBase} />,
    edited: () => <AthleteNameForm {...nameFormBase} draft={{ firstName: 'Lucía', lastName: 'Gómez' }} />,
    'empty-name': () => <AthleteNameForm {...nameFormBase} draft={{ firstName: '', lastName: 'Marin' }} />,
    'saved-offline': () => <AthleteNameForm {...nameFormBase} status={<SyncStatus state="on_device" />} />,
    'not-sent': () => <AthleteNameForm {...nameFormBase} status={<SyncStatus state="not_sent" onRetry={noop} />} />,
    'save-failed': () => <AthleteNameForm {...nameFormBase} draft={{ firstName: 'Lucía', lastName: 'Gómez' }} failed />,
    'long-text': () => <AthleteNameForm {...nameFormBase} firstName="María Fernanda del Carmen" lastName="Rodríguez de la Hoz Santamaría" />,
  }),
  entry('athletePrivateDetailsForm', 'AthletePrivateDetailsForm', {
    empty: () => <AthletePrivateDetailsForm {...detailsFormBase} />,
    saved: () => <AthletePrivateDetailsForm {...detailsFormSaved} />,
    edited: () => <AthletePrivateDetailsForm {...detailsFormSaved} draft={{ birthDate: '2014-06-04', gender: 'M' }} />,
    'future-date': () => <AthletePrivateDetailsForm {...detailsFormBase} draft={{ birthDate: '2026-11-22', gender: '' }} />,
    'before-1900': () => <AthletePrivateDetailsForm {...detailsFormBase} draft={{ birthDate: '1899-12-31', gender: '' }} />,
    'saved-offline': () => <AthletePrivateDetailsForm {...detailsFormSaved} status={<SyncStatus state="on_device" />} />,
    'not-sent': () => <AthletePrivateDetailsForm {...detailsFormSaved} status={<SyncStatus state="not_sent" onRetry={noop} />} />,
    'save-failed': () => <AthletePrivateDetailsForm {...detailsFormBase} draft={{ birthDate: '2014-05-03', gender: 'undisclosed' }} failed />,
  }),
  entry('athleteEditScreen', 'AthleteEditScreen', {
    // The share code lives in accounts, which athletes cannot import: a plain slot stands in for it here.
    'with-photo': () => <AthleteEditScreen athleteId="a1" firstName="Ana" lastName="Marin" onBack={noop} onDone={noop} name={<AthleteNameForm {...nameFormBase} />} photo={<PhotoCard {...photoCardBase} />} />,
    'with-birth-date-gender': () => (
      <AthleteEditScreen
        athleteId="a1"
        firstName="Ana"
        lastName="Marin"
        onBack={noop}
        onDone={noop}
        name={<AthleteNameForm {...nameFormBase} />}
        privateDetails={<AthletePrivateDetailsForm {...detailsFormSaved} />}
      />
    ),
    'with-relink': () => <AthleteEditScreen athleteId="a1" firstName="Ana" lastName="Marin" onBack={noop} onDone={noop} onRelink={noop} name={<AthleteNameForm {...nameFormBase} />} />,
    'long-text': () => (
      <AthleteEditScreen
        athleteId="a2"
        firstName="María Fernanda del Carmen"
        lastName="Rodríguez de la Hoz Santamaría"
        onBack={noop}
        onDone={noop}
        name={<AthleteNameForm {...nameFormBase} firstName="María Fernanda del Carmen" lastName="Rodríguez de la Hoz Santamaría" />}
        photo={<PhotoCard {...photoCardBase} state="ready" avatar={withPhoto} />}
      />
    ),
  }),
  entry('relinkRequestScreen', 'RelinkRequestScreen', {
    empty: () => <RelinkRequestScreen {...relinkBase} />,
    'key-typed': () => <RelinkRequestScreen {...relinkBase} keyValue="AAAA-BBBB-CCCC-DDDD-EEEE" />,
    sending: () => <RelinkRequestScreen {...relinkBase} keyValue="AAAA-BBBB-CCCC-DDDD-EEEE" state="sending" />,
    requested: () => <RelinkRequestScreen {...relinkBase} state="requested" requests={{ kind: 'ready', requests: relinkRequestsFixture.slice(0, 1) }} />,
    'already-requested': () => <RelinkRequestScreen {...relinkBase} state="already_requested" requests={{ kind: 'ready', requests: relinkRequestsFixture.slice(0, 1) }} />,
    'nothing-to-relink': () => <RelinkRequestScreen {...relinkBase} state="nothing_to_relink" />,
    'invalid-key': () => <RelinkRequestScreen {...relinkBase} keyValue="FFFF-FFFF" state="invalid_key" />,
    'rate-limited': () => <RelinkRequestScreen {...relinkBase} state="rate_limited" />,
    'send-failed': () => <RelinkRequestScreen {...relinkBase} keyValue="AAAA-BBBB-CCCC-DDDD-EEEE" state="error" />,
    'with-requests': () => <RelinkRequestScreen {...relinkBase} requests={{ kind: 'ready', requests: relinkRequestsFixture }} />,
    'long-text': () => <RelinkRequestScreen {...relinkBase} athleteName="María Fernanda R." requests={{ kind: 'ready', requests: relinkRequestsLongTextFixture }} />,
    'requests-loading': () => <RelinkRequestScreen {...relinkBase} requests={{ kind: 'loading' }} />,
    'requests-error': () => <RelinkRequestScreen {...relinkBase} requests={{ kind: 'error', onRetry: noop }} />,
  }),
  entry('marksScreen', 'MarksScreen', {
    'with-data': marksPreview(marksFixture),
    'long-pool': marksPreview(marksLongPoolFixture),
    'long-text': marksPreview(marksLongTextFixture),
    empty: marksPreview({ kind: 'empty' }),
    loading: marksPreview({ kind: 'loading' }),
    error: marksPreview({ kind: 'error', onRetry: noop }),
  }),
  entry('recoveryCodesScreen', 'RecoveryCodesScreen', {
    'first-time': () => (
      <ScreenFrame>
        <RecoveryCodesScreen {...recoveryScreenBase} />
      </ScreenFrame>
    ),
    saving: () => (
      <ScreenFrame>
        <RecoveryCodesScreen {...recoveryScreenBase} saving />
      </ScreenFrame>
    ),
    'save-failed': () => (
      <ScreenFrame>
        <RecoveryCodesScreen {...recoveryScreenBase} error />
      </ScreenFrame>
    ),
    'replaces-previous': () => (
      <ScreenFrame>
        <RecoveryCodesScreen {...recoveryScreenBase} replacing />
      </ScreenFrame>
    ),
    'replaced-elsewhere': () => (
      <ScreenFrame>
        <RecoveryCodesReplacedScreen athleteName="Ana" onDone={noop} />
      </ScreenFrame>
    ),
    'new-set': () => (
      <ScreenFrame>
        <RecoveryCodesScreen {...recoveryScreenBase} mainCode={undefined} />
      </ScreenFrame>
    ),
    'long-text': () => (
      <ScreenFrame>
        <RecoveryCodesScreen {...recoveryScreenBase} athleteName="María Fernanda del Carmen Rodríguez de la Hoz" />
      </ScreenFrame>
    ),
  }),
  entry('athleteRecoveryCodeRow', 'AthleteRecoveryCodeRow', {
    hidden: () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} />
      </FullWidth>
    ),
    revealed: () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} revealed />
      </FullWidth>
    ),
    'not-on-this-phone': () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} code={null} revealed />
      </FullWidth>
    ),
    offline: () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} online={false} />
      </FullWidth>
    ),
    'no-code-used': () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} problem="unused" />
      </FullWidth>
    ),
    'regenerate-failed': () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} problem="error" />
      </FullWidth>
    ),
    'replaced-elsewhere': () => (
      <FullWidth>
        <AthleteRecoveryCodeRow {...recoveryRowBase} code={null} revealed problem="replaced" />
      </FullWidth>
    ),
  }),
  entry('athleteResultSharingRow', 'AthleteResultSharingRow', {
    'one-on': () => (
      <FullWidth>
        <AthleteResultSharingRow {...sharingRowBase} />
      </FullWidth>
    ),
    'all-off': () => (
      <FullWidth>
        <AthleteResultSharingRow {...sharingRowBase} schools={sharingRowBase.schools.map((school) => ({ ...school, shared: false }))} />
      </FullWidth>
    ),
    'save-failed': () => (
      <FullWidth>
        <AthleteResultSharingRow {...sharingRowBase} failed />
      </FullWidth>
    ),
    'long-text': () => (
      <FullWidth>
        <AthleteResultSharingRow
          {...sharingRowBase}
          schools={[{ id: 'gallery-school-1', name: 'Escuela de Natación y Deportes Acuáticos de la Región Norte', shared: true }, ...sharingRowBase.schools.slice(1)]}
        />
      </FullWidth>
    ),
  }),
];
