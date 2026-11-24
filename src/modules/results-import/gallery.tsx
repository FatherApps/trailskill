import { useState } from 'react';

import type { GalleryEntry } from '../../core/ui';
import { changeItemsFailedFixture, changeItemsFixture, resultItemsFixture, resultItemsLongTextFixture } from './__fixtures__/officialResults';
import { OfficialUpdateButton } from './components/OfficialUpdateButton';
import { catalogYears, countByDateKey } from './data/tournamentCalendar';
import { groupTournaments, type TournamentCatalogEntry } from './data/tournamentCatalog';
import { ConfirmPersonScreen, type ConfirmPersonView } from './screens/ConfirmPersonScreen';
import { OfficialResultsScreen, type OfficialResultsScreenProps, type OfficialResultsView } from './screens/OfficialResultsScreen';

const noop = () => {};

// Synthetic tournaments only: cities and names that do not exist.
const tournament = (id: string, dateKey: string, name: string, city: string): TournamentCatalogEntry => ({
  id,
  organizationId: 'org-gallery',
  year: Number(dateKey.slice(0, 4)),
  dateKey,
  name,
  city,
  discipline: 'swimming',
  course: null,
  sourceUrl: null,
  refreshedAt: '2026-11-21T00:00:00Z',
});
const catalogFixture = [
  tournament('g1', '20260510', 'Torneo Beta', 'Ciudad Beta'),
  tournament('g2', '20260510', 'Copa Alfa', 'Ciudad Alfa'),
  tournament('g3', '20251018', 'Torneo Alfa Nocturno', 'Ciudad Alfa'),
  tournament('g4', '20251018', 'Torneo Zeta Abierto', 'Ciudad Zeta'),
];

const pickView = (filter: { text?: string; year?: number | null; dateKey?: string | null } = {}, calendarOpen = false, open: string[] = []): ConfirmPersonView => {
  const groups = groupTournaments(catalogFixture, filter);
  // Like the container: a filter opens every section.
  const filtering = !!filter.text || (filter.year ?? null) !== null || !!filter.dateKey;
  return {
    kind: 'tournament_pick',
    athleteName: 'Ana',
    online: true,
    text: filter.text ?? '',
    onChangeText: noop,
    years: catalogYears(catalogFixture),
    year: filter.year ?? null,
    onChangeYear: noop,
    calendarOpen,
    onToggleCalendar: noop,
    month: { year: 2026, month: 5 },
    counts: countByDateKey(catalogFixture),
    dateKey: filter.dateKey ?? null,
    onSelectDay: noop,
    onClearDay: noop,
    onPreviousMonth: noop,
    onNextMonth: noop,
    groups,
    openCities: filtering ? groups.map((group) => group.city) : open,
    onToggleCity: noop,
    onPick: noop,
    onPasteUrl: noop,
  };
};
const screenOf = (view: ConfirmPersonView) => <ConfirmPersonScreen view={view} onBack={noop} />;

// Holds the selection, so tapping a row changes it in the gallery.
function ListPreview({ items, notice, changes = [] }: { items: typeof resultItemsFixture; notice?: OfficialResultsScreenProps['notice']; changes?: typeof changeItemsFixture }) {
  const [selectedIds, setSelectedIds] = useState(items.map((item) => item.id));
  const view: OfficialResultsView = {
    kind: 'list',
    items,
    selectedIds,
    importing: false,
    onToggle: (id) => setSelectedIds((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id])),
    onImport: noop,
    onDismiss: noop,
  };
  return <OfficialResultsScreen view={view} notice={notice} changes={changes} onUseNew={noop} onKeepCurrent={noop} />;
}

const panel = (view: OfficialResultsView, rest: Partial<OfficialResultsScreenProps> = {}) => (
  <OfficialResultsScreen view={view} changes={[]} onUseNew={noop} onKeepCurrent={noop} {...rest} />
);

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'officialUpdateButton',
    title: 'OfficialUpdateButton',
    states: {
      rest: () => <OfficialUpdateButton checking={false} lastUpdated={null} onPress={noop} />,
      'last-updated': () => <OfficialUpdateButton checking={false} lastUpdated="28 oct 2026" onPress={noop} />,
      checking: () => <OfficialUpdateButton checking lastUpdated="28 oct 2026" onPress={noop} />,
    },
  },
  {
    id: 'officialResultsScreen',
    title: 'OfficialResultsScreen',
    states: {
      list: () => <ListPreview items={resultItemsFixture} />,
      'long-text': () => <ListPreview items={resultItemsLongTextFixture} />,
      imported: () => panel({ kind: 'idle' }, { notice: { inserted: 2, changes: 1 }, changes: changeItemsFixture }),
      checking: () => panel({ kind: 'checking' }),
      none: () => panel({ kind: 'none' }),
      unavailable: () => panel({ kind: 'unavailable', onRetry: noop }),
      'rate-limited': () => panel({ kind: 'rate_limited', retryAt: '12:10' }),
      expired: () => <ListPreview items={resultItemsFixture} notice="expired" />,
      'import-failed': () => <ListPreview items={resultItemsFixture} notice="failed" />,
      changes: () => panel({ kind: 'idle' }, { changes: changeItemsFixture }),
      'change-failed': () => panel({ kind: 'idle' }, { changes: changeItemsFailedFixture }),
    },
  },
  {
    id: 'tournamentPicker',
    title: 'TournamentPicker',
    states: {
      list: () => screenOf(pickView()),
      'one-city-open': () => screenOf(pickView({}, false, ['Ciudad Alfa'])),
      filtered: () => screenOf(pickView({ text: 'alfa', year: 2025 })),
      empty: () => screenOf(pickView({ text: 'nada coincide' })),
      // Pending design: the design system has no calendar; it is built from tokens only.
      calendar: () => screenOf(pickView({ dateKey: '20260510', year: 2026 }, true)),
      'calendar-empty-day': () => screenOf(pickView({ dateKey: '20260511', year: 2026 }, true)),
      'no-file': () => screenOf({ kind: 'tournament_no_file', onChange: noop }),
    },
  },
];
