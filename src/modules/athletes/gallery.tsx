import type { GalleryEntry } from '../../core/ui';
import { historyFixture as h, historyLongTextResults, historyResults } from './__fixtures__/history';
import { HistoryList } from './components/HistoryList';
import { ImportPrompt } from './components/ImportPrompt';

const noop = () => {};

const prompt = { athleteName: h.athleteName, onDismiss: noop, onRefresh: noop, onLearnMore: noop };

export const galleryEntries: GalleryEntry[] = [
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
