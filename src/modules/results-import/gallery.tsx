import { useState } from 'react';

import type { GalleryEntry } from '../../core/ui';
import { changeItemsFailedFixture, changeItemsFixture, resultItemsFixture, resultItemsLongTextFixture } from './__fixtures__/officialResults';
import { OfficialUpdateButton } from './components/OfficialUpdateButton';
import { OfficialResultsScreen, type OfficialResultsScreenProps, type OfficialResultsView } from './screens/OfficialResultsScreen';

const noop = () => {};

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
];
