import { useState, type ReactElement, type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import type { GalleryEntry } from '../../core/ui';
import {
  athletesFixture,
  detailFixture,
  detailFor,
  detailsFixture,
  indicatorsFixture,
  longTextAthleteFixture,
  longTextDetailFixture,
  schoolNameFixture,
  storedOnFixture,
} from './__fixtures__/athletes';
import { categoriesFixture, longNameCategoriesFixture } from './__fixtures__/categories';
import { AthleteDetail } from './components/AthleteDetail';
import { AthleteFilters, type AthleteFiltersProps } from './components/AthleteFilters';
import { AthleteIndicators } from './components/AthleteIndicators';
import { AthleteTable } from './components/AthleteTable';
import type { AthleteFilterId } from './components/athleteTypes';
import { ConsoleNav, type ConsoleDestinationId } from './components/ConsoleNav';
import { personalBestLabel } from './components/eventLabel';
import { Logo } from './components/Logo';
import { createInMemoryCategoriesRepository } from './data/categories';
import { SideSheet } from './components/SideSheet';
import { AthletesScreen, type AthletesContent, type AthletesView } from './screens/AthletesScreen';
import { CategoriesScreen, type CategoriesContent } from './screens/CategoriesScreen';
import { CategoriesSection } from './screens/CategoriesSection';
import { ConsoleScreen } from './screens/ConsoleScreen';
import { EmptySectionScreen } from './screens/EmptySectionScreen';

// The preview box shrinks its children to their content; these components need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

const noop = () => {};
const bestLabel = personalBestLabel('FR', '50m');

// The filter values a chip shows once it is active.
const filterValues: Record<AthleteFilterId, string> = { category: 'Categoría B', group: 'Grupo B', coach: 'Paula G.' };

// A chip press turns its filter on with a sample value, or off when it is already on.
function toggleFilter(current: AthleteFiltersProps['filters'], id: AthleteFilterId): AthleteFiltersProps['filters'] {
  const { [id]: removed, ...rest } = current;
  return removed === undefined ? { ...current, [id]: filterValues[id] } : rest;
}

const baseContent: AthletesContent = {
  updatedMinutesAgo: 2,
  indicators: indicatorsFixture,
  query: '',
  filters: {},
  athletes: athletesFixture,
  bestLabel,
  selectedId: null,
  detail: null,
};

// Holds the query, the active filters and the open detail, so tapping a row or a chip changes the screen in the gallery.
// `fixedWidth` shows a layout regardless of the device; otherwise the screen follows the width of the preview.
function AthletesScreenPreview({
  view,
  fixedWidth,
  initialSelected = null,
}: {
  view: (content: AthletesContent) => AthletesView;
  fixedWidth?: number;
  initialSelected?: string | null;
}) {
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<AthleteFiltersProps['filters']>({});
  const [measured, setMeasured] = useState(useWindowDimensions().width);

  const athlete = athletesFixture.find((row) => row.id === selectedId);
  const content: AthletesContent = {
    ...baseContent,
    query,
    filters,
    selectedId,
    detail: athlete ? detailFor(athlete) : null,
  };

  const screen = (
    <AthletesScreen
      width={fixedWidth ?? measured}
      schoolName={schoolNameFixture}
      view={view(content)}
      scrollEnabled={false}
      onNavigate={noop}
      onInvite={noop}
      onQueryChange={setQuery}
      onFilterPress={(id) =>
        setFilters((current) => toggleFilter(current, id))
      }
      onSelect={setSelectedId}
      onCloseDetail={() => setSelectedId(null)}
      onViewProfile={noop}
    />
  );

  // A fixed width can be wider than the phone: it scrolls sideways inside the preview.
  if (fixedWidth !== undefined) {
    return (
      <ScrollView horizontal testID="console-preview" style={{ alignSelf: 'stretch' }}>
        <View style={{ width: fixedWidth, minHeight: 720 }}>{screen}</View>
      </ScrollView>
    );
  }

  return (
    <View
      testID="console-preview"
      onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
      style={{ alignSelf: 'stretch', minHeight: 720 }}
    >
      {screen}
    </View>
  );
}

const screenPreview = (view: (content: AthletesContent) => AthletesView, options?: { fixedWidth?: number; initialSelected?: string }) =>
  function ScreenPreview() {
    return <AthletesScreenPreview view={view} {...options} />;
  };

// Shows a screen at a fixed width (scrolling sideways when wider than the phone) or at the measured width of the preview.
function WidthPreview({ fixedWidth, children }: { fixedWidth?: number; children: (width: number) => ReactElement }) {
  const [measured, setMeasured] = useState(useWindowDimensions().width);
  if (fixedWidth !== undefined) {
    return (
      <ScrollView horizontal testID="console-preview" style={{ alignSelf: 'stretch' }}>
        <View style={{ width: fixedWidth, minHeight: 720 }}>{children(fixedWidth)}</View>
      </ScrollView>
    );
  }
  return (
    <View
      testID="console-preview"
      onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
      style={{ alignSelf: 'stretch', minHeight: 720 }}
    >
      {children(measured)}
    </View>
  );
}

// The settings section has no screen yet, so it shows its title only; the other tabs switch sections in place.
function EmptySectionPreview({ fixedWidth }: { fixedWidth: number }) {
  const [sectionId, setSectionId] = useState<ConsoleDestinationId>('settings');
  return (
    <WidthPreview fixedWidth={fixedWidth}>
      {(width) => (
        <EmptySectionScreen
          width={width}
          schoolName={schoolNameFixture}
          sectionId={sectionId}
          onNavigate={setSectionId}
          scrollEnabled={false}
        />
      )}
    </WidthPreview>
  );
}

// The categories screen with fixed content: its own rename and confirmation state still works, the changes do not persist.
function CategoriesPreview({
  content,
  fixedWidth,
  initialRenamingId,
  initialConfirmId,
}: {
  content: CategoriesContent;
  fixedWidth?: number;
  initialRenamingId?: string;
  initialConfirmId?: string;
}) {
  return (
    <WidthPreview fixedWidth={fixedWidth}>
      {(width) => (
        <CategoriesScreen
          width={width}
          schoolName={schoolNameFixture}
          content={content}
          scrollEnabled={false}
          initialRenamingId={initialRenamingId}
          initialConfirmId={initialConfirmId}
          onNavigate={noop}
          onCreate={noop}
          onRename={noop}
          onMove={noop}
          onSetActive={noop}
          onRetry={noop}
        />
      )}
    </WidthPreview>
  );
}

// The whole section over an in-memory repository, so adding, renaming, moving and deactivating work in the gallery.
function InteractiveCategoriesPreview({ fixedWidth }: { fixedWidth?: number }) {
  const [repository] = useState(() => createInMemoryCategoriesRepository({ categories: categoriesFixture, athleteSchools: [] }));
  return (
    <WidthPreview fixedWidth={fixedWidth}>
      {(width) => (
        <CategoriesSection
          width={width}
          schoolName={schoolNameFixture}
          repository={repository}
          schoolId={categoriesFixture[0].schoolId}
          scrollEnabled={false}
          onNavigate={noop}
        />
      )}
    </WidthPreview>
  );
}

const ready = (categories: CategoriesContent['categories']): CategoriesContent => ({ status: 'ready', categories });

// Holds the query and the filters, so typing and tapping a chip change the component in the gallery.
function FiltersPreview({ initial }: { initial: AthleteFiltersProps['filters'] }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(initial);

  return (
    <FullWidth>
      <AthleteFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFilterPress={(id) =>
          setFilters((current) => toggleFilter(current, id))
        }
      />
    </FullWidth>
  );
}

// Holds the selection, so tapping a row selects it in the gallery.
function TablePreview({ athletes, compact = false, initial = null }: { athletes: typeof athletesFixture; compact?: boolean; initial?: string | null }) {
  const [selectedId, setSelectedId] = useState(initial);

  return (
    <FullWidth>
      <AthleteTable athletes={athletes} bestLabel={bestLabel} selectedId={selectedId} onSelect={setSelectedId} compact={compact} />
    </FullWidth>
  );
}

const entry = (id: string, title: string, states: Record<string, () => ReactElement>): GalleryEntry => ({ id, title, states });

export const galleryEntries: GalleryEntry[] = [
  entry('logo', 'Logo', {
    default: () => <Logo />,
    large: () => <Logo height={64} />,
  }),
  entry('consoleNav', 'ConsoleNav', {
    side: () => <ConsoleNav variant="side" activeId="athletes" onSelect={noop} schoolName={schoolNameFixture} />,
    top: () => (
      <FullWidth>
        <ConsoleNav variant="top" activeId="records" onSelect={noop} schoolName={schoolNameFixture} />
      </FullWidth>
    ),
  }),
  entry('sideSheet', 'SideSheet', {
    open: () => (
      <View style={{ alignSelf: 'stretch', height: 560 }}>
        <SideSheet label={detailFixture.name} onClose={noop}>
          <AthleteDetail athlete={detailFixture} onViewProfile={noop} />
        </SideSheet>
      </View>
    ),
  }),
  entry('athleteIndicators', 'AthleteIndicators', {
    default: () => (
      <FullWidth>
        <AthleteIndicators {...indicatorsFixture} />
      </FullWidth>
    ),
    'large-numbers': () => (
      <FullWidth>
        <AthleteIndicators active={12840} pendingAuthorization={1207} measurementsThisWeek={34250} toReview={0} />
      </FullWidth>
    ),
  }),
  entry('athleteFilters', 'AthleteFilters', {
    empty: () => <FiltersPreview initial={{}} />,
    'with-filter': () => <FiltersPreview initial={{ category: filterValues.category }} />,
    'all-filters': () => <FiltersPreview initial={filterValues} />,
  }),
  entry('athleteTable', 'AthleteTable', {
    default: () => <TablePreview athletes={athletesFixture} />,
    selected: () => <TablePreview athletes={athletesFixture} initial="a1" />,
    'long-text': () => <TablePreview athletes={[...athletesFixture.slice(0, 2), longTextAthleteFixture]} />,
    compact: () => <TablePreview athletes={athletesFixture} compact initial="a1" />,
  }),
  entry('athleteDetail', 'AthleteDetail', {
    default: () => (
      <FullWidth>
        <AthleteDetail athlete={detailFixture} onViewProfile={noop} />
      </FullWidth>
    ),
    'pending-no-bests': () => (
      <FullWidth>
        <AthleteDetail athlete={detailsFixture.a3} onViewProfile={noop} />
      </FullWidth>
    ),
    'long-text': () => (
      <FullWidth>
        <AthleteDetail athlete={longTextDetailFixture} onViewProfile={noop} />
      </FullWidth>
    ),
  }),
  entry('athletesScreen', 'AthletesScreen', {
    // Follows the width of the preview: a tablet in landscape shows the expanded layout, in portrait the medium one.
    'with-data': screenPreview((content) => ({ kind: 'data', content })),
    loading: screenPreview(() => ({ kind: 'loading' })),
    empty: screenPreview(() => ({ kind: 'empty' })),
    error: screenPreview(() => ({ kind: 'error', onRetry: noop })),
    'offline-with-data': screenPreview((content) => ({ kind: 'offline', storedOn: storedOnFixture, content })),
    'offline-no-data': screenPreview(() => ({ kind: 'offline-empty' })),
    denied: screenPreview(() => ({ kind: 'denied' })),
    // The three layouts at a fixed width, on any device.
    'expanded-1280': screenPreview((content) => ({ kind: 'data', content }), { fixedWidth: 1280, initialSelected: 'a1' }),
    'medium-800': screenPreview((content) => ({ kind: 'data', content }), { fixedWidth: 800 }),
    'compact-360': screenPreview((content) => ({ kind: 'data', content }), { fixedWidth: 360 }),
  }),
  entry('categoriesScreen', 'CategoriesScreen', {
    // Backed by an in-memory repository: everything can be tapped. Follows the width of the preview.
    interactive: () => <InteractiveCategoriesPreview />,
    'with-inactive': () => <CategoriesPreview content={ready(categoriesFixture)} />,
    empty: () => <CategoriesPreview content={ready([])} />,
    loading: () => <CategoriesPreview content={{ status: 'loading', categories: [] }} />,
    error: () => <CategoriesPreview content={{ status: 'error', categories: [] }} />,
    renaming: () => <CategoriesPreview content={ready(categoriesFixture)} initialRenamingId="c2" />,
    'confirm-open': () => <CategoriesPreview content={ready(categoriesFixture)} initialConfirmId="c1" />,
    // Long names wrap; nothing is cut.
    'long-names': () => <CategoriesPreview content={ready(longNameCategoriesFixture)} />,
    'expanded-1280': () => <InteractiveCategoriesPreview fixedWidth={1280} />,
    'medium-800': () => <InteractiveCategoriesPreview fixedWidth={800} />,
    'compact-360': () => <InteractiveCategoriesPreview fixedWidth={360} />,
  }),
  entry('consoleScreen', 'ConsoleScreen', {
    // The shell that holds the active section; follows the width of the preview.
    shell: () => (
      <WidthPreview>
        {(width) => <ConsoleScreen width={width} schoolName={schoolNameFixture} scrollEnabled={false} />}
      </WidthPreview>
    ),
    // The section without a screen yet ('Categorías' under Ajustes) in the three layouts.
    'expanded-1280': () => <EmptySectionPreview fixedWidth={1280} />,
    'medium-800': () => <EmptySectionPreview fixedWidth={800} />,
    'compact-360': () => <EmptySectionPreview fixedWidth={360} />,
  }),
];
