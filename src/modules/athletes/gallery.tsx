import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../../core/ui';
import { historyFixture as h, historyLongTextResults, historyResults } from './__fixtures__/history';
import { eventFixture as ev, personalBestFixture as pb, profileFixture as pf } from './__fixtures__/profile';
import { EventSelector, type EventValue } from './components/EventSelector';
import { HistoryList } from './components/HistoryList';
import { ImportPrompt } from './components/ImportPrompt';
import { PersonalBest, type PersonalBestProps } from './components/PersonalBest';
import { ProfileHeader, type ProfileHeaderProps } from './components/ProfileHeader';

// The preview box shrinks its children to their content; these components need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

const headerBase: ProfileHeaderProps = {
  name: pf.name,
  category: pf.category,
  schools: pf.schools.slice(0, 1),
  schoolId: pf.schools[0].id,
  authorization: 'valid',
  updatedMinutesAgo: 5,
};

// Holds the school, so tapping an option changes it in the gallery.
function ProfileHeaderPreview(props: ProfileHeaderProps) {
  const [schoolId, setSchoolId] = useState(props.schoolId);

  return (
    <FullWidth>
      <ProfileHeader {...props} schoolId={schoolId} onSchoolChange={setSchoolId} />
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

const noop = () => {};

const prompt = { athleteName: h.athleteName, onDismiss: noop, onRefresh: noop, onLearnMore: noop };

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
];
