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
import { AthleteDetail } from './components/AthleteDetail';
import { AthleteFilters, type AthleteFiltersProps } from './components/AthleteFilters';
import { AthleteIndicators } from './components/AthleteIndicators';
import { AthleteTable } from './components/AthleteTable';
import type { AthleteFilterOption } from './components/AthleteFilterOptions';
import type { AthleteFilterId } from './components/athleteTypes';
import { ConsoleNav, type ConsoleDestinationId } from './components/ConsoleNav';
import { personalBestLabel } from './components/eventLabel';
import { Logo } from './components/Logo';
import { SideSheet } from './components/SideSheet';
import { AthletesScreen, type AthletesContent, type AthletesView } from './screens/AthletesScreen';
import { ConsoleScreen } from './screens/ConsoleScreen';
import { EmptySectionScreen } from './screens/EmptySectionScreen';

// The preview box shrinks its children to their content; these components need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

const noop = () => {};
const bestLabel = personalBestLabel('FR', '50m');

// The filter values a chip shows once it is active.
const filterValues: Record<AthleteFilterId, string> = { category: 'Infantil B', group: 'Grupo B', coach: 'Paula G.' };

// The options a filter sheet lists. The coaches have no name yet (issue 220).
const sheetOptions: Record<AthleteFilterId, AthleteFilterOption[]> = {
  category: [
    { id: 'c1', label: 'Infantil B' },
    { id: 'c2', label: 'Juvenil' },
  ],
  group: [
    { id: 'g1', label: 'Grupo B' },
    { id: 'g2', label: 'Grupo C' },
  ],
  coach: [
    { id: 'k1', label: null },
    { id: 'k2', label: null },
  ],
};

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
  initialQuery = '',
  initialSheet = null,
}: {
  view: (content: AthletesContent) => AthletesView;
  fixedWidth?: number;
  initialSelected?: string | null;
  initialQuery?: string;
  // The filter whose sheet starts open; choosing an option applies it and closes the sheet.
  initialSheet?: AthleteFilterId | null;
}) {
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [query, setQuery] = useState(initialQuery);
  const [sheetId, setSheetId] = useState(initialSheet);
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
      onClearFilters={() => {
        setQuery('');
        setFilters({});
      }}
      filterSheet={
        sheetId
          ? {
              id: sheetId,
              options: sheetOptions[sheetId],
              selectedId: undefined,
              onChoose: (optionId) => {
                const label = sheetOptions[sheetId].find((option) => option.id === optionId)?.label;
                if (label) setFilters((current) => ({ ...current, [sheetId]: label }));
                setSheetId(null);
              },
              onClose: () => setSheetId(null),
            }
          : undefined
      }
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

const screenPreview = (
  view: (content: AthletesContent) => AthletesView,
  options?: { fixedWidth?: number; initialSelected?: string; initialQuery?: string; initialSheet?: AthleteFilterId },
) =>
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
    // A filter chip opens a sheet with the options of that filter.
    'filter-sheet': screenPreview((content) => ({ kind: 'data', content }), { fixedWidth: 800, initialSheet: 'category' }),
    // The coach names arrive with issue 220: until then the sheet says so.
    'filter-sheet-coach': screenPreview((content) => ({ kind: 'data', content }), { fixedWidth: 800, initialSheet: 'coach' }),
    // The search leaves no row: the state offers to clear the search and the filters.
    'no-match': screenPreview(
      (content) => ({ kind: 'data', content: { ...content, athletes: content.query === 'zzz' ? [] : content.athletes } }),
      { fixedWidth: 800, initialQuery: 'zzz' },
    ),
    // What is not known is "Sin dato", never invented and never 0: "Por revisar", the coach, the guardian and the contact.
    'sin-dato': screenPreview(
      (content) => ({
        kind: 'data',
        content: {
          ...content,
          indicators: { ...content.indicators, toReview: null },
          athletes: content.athletes.map((athlete) => ({ ...athlete, coach: null })),
          detail: content.detail && { ...content.detail, guardian: { name: null, contact: null } },
        },
      }),
      { fixedWidth: 1280, initialSelected: 'a1' },
    ),
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
