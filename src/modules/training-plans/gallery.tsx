import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { t } from '../../core/i18n';
import { space } from '../../core/theme';
import type { GalleryEntry } from '../../core/ui';
import { BlockCard } from './components/BlockCard';
import { blockErrors, newDraftBlock, type BlockErrors, type DraftBlock } from './draft';
import { plansFixture } from './__fixtures__/plans';
import { PlanBuilderScreen } from './screens/PlanBuilderScreen';
import { TodayScreen, type TodayView } from './screens/TodayScreen';
import type { BlockPhase, BlockRecording } from './types';

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

type BuilderPreviewProps = {
  initial: DraftBlock[];
  initialName?: string;
  initialEditingId?: string | null;
  initialRemovingId?: string | null;
  // Shows the field errors as after a failed save.
  showErrors?: boolean;
  savedMessage?: boolean;
};

// Holds the blocks, so adding, moving, editing and removing really work in the gallery.
function BuilderPreview({
  initial,
  initialName = 'Resistencia aeróbica',
  initialEditingId = null,
  initialRemovingId = null,
  showErrors = false,
  savedMessage = false,
}: BuilderPreviewProps) {
  const [current, setCurrent] = useState(initial);
  const [name, setName] = useState(initialName);
  const [editingId, setEditingId] = useState(initialEditingId);
  const [message, setMessage] = useState(savedMessage ? t('training_plans.builder.saved') : undefined);

  const add = () => {
    const block = newDraftBlock(`new-${current.length + 1}`, vocabulary);
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
  const editing = current.find((block) => block.id === editingId);
  const errors: BlockErrors | undefined = showErrors && editing ? blockErrors(editing, vocabulary) : undefined;

  return (
    <ScreenFrame>
      <PlanBuilderScreen
        planName={name}
        nameError={showErrors && name.trim() === ''}
        blocks={current}
        vocabulary={vocabulary}
        editingId={editingId}
        editingErrors={errors}
        message={message ? { kind: 'success', text: message } : undefined}
        defaultRemovingId={initialRemovingId}
        onChangeName={setName}
        onAddBlock={add}
        onEditBlock={setEditingId}
        onMoveBlock={move}
        onChangeBlock={(changed) => setCurrent((list) => list.map((block) => (block.id === changed.id ? changed : block)))}
        onDoneEditing={() => setEditingId(null)}
        onRemoveBlock={(id) => setCurrent((list) => list.filter((block) => block.id !== id))}
        onSave={() => setMessage(t('training_plans.builder.saved'))}
        onSaveTemplate={() => setMessage(t('training_plans.builder.template_saved'))}
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
      // A new block with no activity and nothing recorded, after a failed save; the name is empty too.
      errors: () => (
        <BuilderPreview
          initial={[...blocks.slice(0, 2), newDraftBlock('new-draft', vocabulary)]}
          initialName=""
          initialEditingId="new-draft"
          showErrors
        />
      ),
      // A drill typed instead of a stroke.
      drill: () => <BuilderPreview initial={blocks} initialEditingId={blocks[2].id} />,
      removing: () => <BuilderPreview initial={blocks} initialRemovingId={blocks[1].id} />,
      saved: () => <BuilderPreview initial={blocks} savedMessage />,
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
