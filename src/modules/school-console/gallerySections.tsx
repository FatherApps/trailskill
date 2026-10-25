import { useState, type ReactElement, type ReactNode } from 'react';

import type { PoolCode } from '../../core/sport';
import type { GalleryEntry } from '../../core/ui';
import { schoolNameFixture, storedOnFixture } from './__fixtures__/athletes';
import { authorizationsFixture, longTextAuthorizationFixture, sharingRequestsFixture } from './__fixtures__/authorizations';
import { coachesFixture, longTextCoachFixture } from './__fixtures__/coaches';
import { longTextMeasurementFixture, measurementsFixture, measurementsUpdatedMinutesAgo } from './__fixtures__/measurements';
import { longTextRecordFixture, recordCategoryFixture, recordsFixture, recordsUpdatedMinutesAgo } from './__fixtures__/records';
import type { AthleteFiltersProps } from './components/AthleteFilters';
import { AuthorizationList, SharingRequestList } from './components/AuthorizationList';
import { CoachList } from './components/CoachList';
import { MeasurementLog } from './components/MeasurementLog';
import { RecordTable } from './components/RecordTable';
import type { SectionView } from './components/SectionFrame';
import { ConsolePreview, FullWidth, noop, toggleFilter } from './gallerySupport';
import { AuthorizationsScreen, type AuthorizationsContent } from './screens/AuthorizationsScreen';
import { CoachesScreen, type CoachesContent } from './screens/CoachesScreen';
import { MeasurementsScreen, type MeasurementsContent } from './screens/MeasurementsScreen';
import { RecordsScreen, type RecordsContent } from './screens/RecordsScreen';

// The ten states every section screen shows: the content, the five view states, and the three layouts at a fixed
// width on any device. Without a fixed width the screen follows the width of the preview: a tablet in landscape shows
// the expanded layout, in portrait the medium one.
function sectionStates<Content>(
  content: Content,
  screen: (view: SectionView<Content>, width: number) => ReactNode,
): Record<string, () => ReactElement> {
  const preview = (view: SectionView<Content>, fixedWidth?: number) =>
    function SectionPreview() {
      return <ConsolePreview fixedWidth={fixedWidth}>{(width) => screen(view, width)}</ConsolePreview>;
    };
  const data: SectionView<Content> = { kind: 'data', content };
  return {
    'with-data': preview(data),
    loading: preview({ kind: 'loading' }),
    empty: preview({ kind: 'empty' }),
    error: preview({ kind: 'error', onRetry: noop }),
    'offline-with-data': preview({ kind: 'offline', storedOn: storedOnFixture, content }),
    'offline-no-data': preview({ kind: 'offline-empty' }),
    denied: preview({ kind: 'denied' }),
    'expanded-1280': preview(data, 1280),
    'medium-800': preview(data, 800),
    'compact-360': preview(data, 360),
  };
}

const entry = (id: string, title: string, states: Record<string, () => ReactElement>): GalleryEntry => ({ id, title, states });

const coachesContent: CoachesContent = { updatedMinutesAgo: 2, coaches: coachesFixture };

// The pool and the category chip are the caller's: the preview holds the pool, so the segments change the table.
function RecordsPreview({ view, width }: { view: SectionView<RecordsContent>; width: number }) {
  const [pool, setPool] = useState<PoolCode>('SCM');
  const shown: SectionView<RecordsContent> =
    view.kind === 'data' || view.kind === 'offline' ? { ...view, content: { ...view.content, pool } } : view;
  return (
    <RecordsScreen
      width={width}
      schoolName={schoolNameFixture}
      view={shown}
      scrollEnabled={false}
      onNavigate={noop}
      onCategoryPress={noop}
      onPoolChange={setPool}
    />
  );
}

const recordsContent: RecordsContent = {
  updatedMinutesAgo: recordsUpdatedMinutesAgo,
  category: recordCategoryFixture,
  rows: recordsFixture,
  pool: 'SCM',
};

// The query and the filters are the caller's: the preview holds them, so typing and tapping a chip change the screen.
function MeasurementsPreview({ view, width }: { view: SectionView<MeasurementsContent>; width: number }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<AthleteFiltersProps['filters']>({});
  const shown: SectionView<MeasurementsContent> =
    view.kind === 'data' || view.kind === 'offline' ? { ...view, content: { ...view.content, query, filters } } : view;
  return (
    <MeasurementsScreen
      width={width}
      schoolName={schoolNameFixture}
      view={shown}
      scrollEnabled={false}
      onNavigate={noop}
      onQueryChange={setQuery}
      onFilterPress={(id) => setFilters((current) => toggleFilter(current, id))}
    />
  );
}

const measurementsContent: MeasurementsContent = {
  updatedMinutesAgo: measurementsUpdatedMinutesAgo,
  query: '',
  filters: {},
  entries: measurementsFixture,
};

const authorizationsContent: AuthorizationsContent = {
  updatedMinutesAgo: 2,
  athletes: authorizationsFixture,
  sharingRequests: sharingRequestsFixture,
};

export const gallerySectionEntries: GalleryEntry[] = [
  entry('coachList', 'CoachList', {
    default: () => (
      <FullWidth>
        <CoachList coaches={coachesFixture} onDeactivate={noop} />
      </FullWidth>
    ),
    'long-text': () => (
      <FullWidth>
        <CoachList coaches={[...coachesFixture.slice(0, 1), longTextCoachFixture]} onDeactivate={noop} />
      </FullWidth>
    ),
  }),
  entry(
    'coachesScreen',
    'CoachesScreen',
    sectionStates(coachesContent, (view, width) => (
      <CoachesScreen width={width} schoolName={schoolNameFixture} view={view} scrollEnabled={false} onNavigate={noop} onInvite={noop} onDeactivate={noop} />
    )),
  ),
  entry('recordTable', 'RecordTable', {
    default: () => (
      <FullWidth>
        <RecordTable rows={recordsFixture} pool="SCM" />
      </FullWidth>
    ),
    'other-pool': () => (
      <FullWidth>
        <RecordTable rows={recordsFixture} pool="LCM" />
      </FullWidth>
    ),
    'long-text': () => (
      <FullWidth>
        <RecordTable rows={[...recordsFixture.slice(0, 2), longTextRecordFixture]} pool="SCM" />
      </FullWidth>
    ),
    compact: () => (
      <FullWidth>
        <RecordTable rows={recordsFixture} pool="SCM" compact />
      </FullWidth>
    ),
    'pool-empty': () => (
      <FullWidth>
        <RecordTable rows={recordsFixture.filter((row) => row.pool === 'LCM')} pool="SCM" />
      </FullWidth>
    ),
  }),
  entry(
    'recordsScreen',
    'RecordsScreen',
    sectionStates(recordsContent, (view, width) => <RecordsPreview view={view} width={width} />),
  ),
  entry('measurementLog', 'MeasurementLog', {
    default: () => (
      <FullWidth>
        <MeasurementLog entries={measurementsFixture} />
      </FullWidth>
    ),
    'long-text': () => (
      <FullWidth>
        <MeasurementLog entries={[measurementsFixture[0], longTextMeasurementFixture]} />
      </FullWidth>
    ),
    'no-results': () => (
      <FullWidth>
        <MeasurementLog entries={[]} />
      </FullWidth>
    ),
  }),
  entry(
    'measurementsScreen',
    'MeasurementsScreen',
    sectionStates(measurementsContent, (view, width) => <MeasurementsPreview view={view} width={width} />),
  ),
  entry('authorizationList', 'AuthorizationList', {
    default: () => (
      <FullWidth>
        <AuthorizationList athletes={authorizationsFixture} onResend={noop} />
      </FullWidth>
    ),
    'long-text': () => (
      <FullWidth>
        <AuthorizationList athletes={[authorizationsFixture[0], longTextAuthorizationFixture]} onResend={noop} />
      </FullWidth>
    ),
    'sharing-requests': () => (
      <FullWidth>
        <SharingRequestList requests={sharingRequestsFixture} onApprove={noop} onWithdraw={noop} />
      </FullWidth>
    ),
  }),
  entry(
    'authorizationsScreen',
    'AuthorizationsScreen',
    sectionStates(authorizationsContent, (view, width) => (
      <AuthorizationsScreen
        width={width}
        schoolName={schoolNameFixture}
        view={view}
        scrollEnabled={false}
        onNavigate={noop}
        onResend={noop}
        onApproveSharing={noop}
        onWithdrawSharing={noop}
      />
    )),
  ),
];
