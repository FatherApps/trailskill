import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { space } from '../../core/theme';
import type { GalleryEntry } from '../../core/ui';
import { BlockCard } from './components/BlockCard';
import { plansFixture } from './__fixtures__/plans';
import { PlanBuilderScreen } from './screens/PlanBuilderScreen';
import { TodayScreen, type TodayView } from './screens/TodayScreen';
import type { BlockPhase, BlockRecording, PlanBlock } from './types';

const noop = () => {};
const { vocabulary, blocks, today, athleteName, storedOnLabel } = plansFixture;

// The preview box shrinks its children; a screen fills a phone-like area instead, and its own ScrollView scrolls.
function ScreenFrame({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={{ alignSelf: 'stretch', height: height * 0.8 }}>{children}</View>;
}

function Stack({ children }: { children: ReactNode }) {
  return <View style={{ alignSelf: 'stretch', gap: space[2] }}>{children}</View>;
}

const phases: BlockPhase[] = ['warm_up', 'main', 'technique', 'cool_down'];
const recordings: BlockRecording[] = ['completion', 'per_repetition', 'series_total'];

// Holds the blocks, so adding, moving and editing really work in the gallery.
function BuilderPreview({ initial, initialEditingId = null }: { initial: PlanBlock[]; initialEditingId?: string | null }) {
  const [current, setCurrent] = useState(initial);
  const [editingId, setEditingId] = useState(initialEditingId);

  const add = () => {
    const block: PlanBlock = {
      id: `new-${current.length + 1}`,
      phase: 'main',
      repetitions: 1,
      distance: 50,
      activity: vocabulary.activities[0].value,
      equipment: [],
      sendOffSeconds: null,
      recording: 'completion',
    };
    setCurrent([...current, block]);
    setEditingId(block.id);
  };
  const move = (id: string, direction: 'up' | 'down') =>
    setCurrent((list) => {
      const from = list.findIndex((block) => block.id === id);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  return (
    <ScreenFrame>
      <PlanBuilderScreen
        planName="Resistencia aeróbica"
        blocks={current}
        vocabulary={vocabulary}
        editingId={editingId}
        onAddBlock={add}
        onEditBlock={setEditingId}
        onMoveBlock={move}
        onChangeBlock={(changed) => setCurrent((list) => list.map((block) => (block.id === changed.id ? changed : block)))}
        onDoneEditing={() => setEditingId(null)}
        onSaveTemplate={noop}
      />
    </ScreenFrame>
  );
}

function TodayPreview({ view }: { view: TodayView }) {
  return (
    <ScreenFrame>
      <TodayScreen athleteName={athleteName} view={view} onReportToCoach={noop} />
    </ScreenFrame>
  );
}

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'blockCard',
    title: 'BlockCard',
    states: {
      phases: () => (
        <Stack>
          {phases.map((phase) => (
            <BlockCard key={phase} block={{ ...blocks[2], id: phase, phase }} vocabulary={vocabulary} />
          ))}
        </Stack>
      ),
      recordings: () => (
        <Stack>
          {recordings.map((recording) => (
            <BlockCard key={recording} block={{ ...blocks[1], id: recording, recording }} vocabulary={vocabulary} />
          ))}
        </Stack>
      ),
    },
  },
  {
    id: 'planBuilder',
    title: 'PlanBuilderScreen',
    states: {
      empty: () => <BuilderPreview initial={[]} />,
      blocks: () => <BuilderPreview initial={blocks} />,
      editing: () => <BuilderPreview initial={blocks} initialEditingId={blocks[1].id} />,
    },
  },
  {
    id: 'today',
    title: 'TodayScreen',
    states: {
      today: () => <TodayPreview view={{ kind: 'data', content: today }} />,
      loading: () => <TodayPreview view={{ kind: 'loading' }} />,
      empty: () => <TodayPreview view={{ kind: 'empty' }} />,
      error: () => <TodayPreview view={{ kind: 'error', onRetry: noop }} />,
      offline: () => <TodayPreview view={{ kind: 'offline', storedOnLabel, content: today }} />,
      'offline-empty': () => <TodayPreview view={{ kind: 'offline-empty' }} />,
      denied: () => <TodayPreview view={{ kind: 'denied' }} />,
    },
  },
] satisfies { id: string; title: string; states: Record<string, () => ReactElement> }[];
