import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../../core/ui';
import { historyFixture as h, historyLongTextResults, historyResults } from './__fixtures__/history';
import { myAthletesFixture, myAthletesLongTextFixture } from './__fixtures__/myAthletes';
import { profileContentFixture, storedOnFixture } from './__fixtures__/screen';
import { eventFixture as ev, personalBestFixture as pb, profileFixture as pf } from './__fixtures__/profile';
import { EventSelector, type EventValue } from './components/EventSelector';
import { HistoryList } from './components/HistoryList';
import { ImportPrompt } from './components/ImportPrompt';
import { PersonalBest, type PersonalBestProps } from './components/PersonalBest';
import { ProfileHeader, type ProfileHeaderProps } from './components/ProfileHeader';
import { AthleteProfileScreen, type AthleteProfileContent, type AthleteProfileView } from './screens/AthleteProfileScreen';
import { MyAthletesScreen, type MyAthletesView } from './screens/MyAthletesScreen';

// The preview box shrinks its children to their content; these components need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

const noop = () => {};

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
      <EventSelector strokes={ev.strokes} distances={ev.distances} pools={pools} value={value} onChange={setValue} />
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

const prompt = { athleteName: h.athleteName, onDismiss: noop, onRefresh: noop, onLearnMore: noop };

// Holds the event selection, so tapping an option changes it in the gallery. `view` picks the state to show.
function AthleteProfileScreenPreview({ view }: { view: (content: AthleteProfileContent) => AthleteProfileView }) {
  const [value, setValue] = useState<EventValue>(profileContentFixture.event.value);
  const content = { ...profileContentFixture, event: { ...profileContentFixture.event, value, onChange: setValue } };

  // The gallery page scrolls, so the list inside does not.
  return <AthleteProfileScreen name={pf.name} view={view(content)} scrollEnabled={false} />;
}

const screenPreview = (view: (content: AthleteProfileContent) => AthleteProfileView) =>
  function ScreenPreview() {
    return <AthleteProfileScreenPreview view={view} />;
  };

const myAthletesPreview = (view: MyAthletesView) =>
  function MyAthletesPreview() {
    return <MyAthletesScreen view={view} onOpen={noop} scrollEnabled={false} />;
  };

const entry = (id: string, title: string, states: Record<string, () => ReactElement>): GalleryEntry => ({
  id,
  title,
  states,
});

export const galleryEntries: GalleryEntry[] = [
  entry('profileHeader', 'ProfileHeader', {
    'one-school': () => <ProfileHeaderPreview {...headerBase} />,
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
  }),
  entry('myAthletesScreen', 'MyAthletesScreen', {
    'with-data': myAthletesPreview({ kind: 'data', athletes: myAthletesFixture }),
    'long-text': myAthletesPreview({ kind: 'data', athletes: myAthletesLongTextFixture }),
    empty: myAthletesPreview({ kind: 'empty' }),
    loading: myAthletesPreview({ kind: 'loading' }),
  }),
];
