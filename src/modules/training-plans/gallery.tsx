import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { t } from '../../core/i18n';
import { space } from '../../core/theme';
import type { GalleryEntry } from '../../core/ui';
import { BlockCard } from './components/BlockCard';
import { cellKey, type FulfillmentCell, type FulfillmentContent } from './components/fulfillment';
import { fulfillmentFixture } from './__fixtures__/fulfillment';
import { blockErrors, newDraftBlock, type BlockErrors, type DraftBlock } from './draft';
import { plansFixture } from './__fixtures__/plans';
import { FulfillmentScreen, type FulfillmentView } from './screens/FulfillmentScreen';
import { AssignPlanScreen, type AssignPlanView } from './screens/AssignPlanScreen';
import { PlanBuilderScreen } from './screens/PlanBuilderScreen';
import { PlanListScreen, type PlanListView } from './screens/PlanListScreen';
import { TodayScreen, type TodayView } from './screens/TodayScreen';
import { phases, recordings, type BlockStatus } from './types';

const noop = () => {};
const { vocabulary, blocks, today, athleteName, athletes, storedOnLabel, planList } = plansFixture;

// The preview box shrinks its children; a screen fills a phone-like area instead, and its own ScrollView scrolls.
function ScreenFrame({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={{ alignSelf: 'stretch', height: height * 0.8 }}>{children}</View>;
}

function Stack({ children }: { children: ReactNode }) {
  return <View style={{ alignSelf: 'stretch', gap: space[2] }}>{children}</View>;
}

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

// With `withPicker` the chips really switch, as the container does.
function TodayPreview({ view, withPicker = false }: { view: TodayView; withPicker?: boolean }) {
  const [selectedId, setSelectedId] = useState(athletes[0].id);
  const shown = withPicker ? athletes.find(({ id }) => id === selectedId)! : undefined;
  return (
    <ScreenFrame>
      <TodayScreen
        athleteName={shown?.name ?? athleteName}
        view={view}
        athletes={withPicker ? athletes : undefined}
        selectedAthleteId={selectedId}
        onSelectAthlete={setSelectedId}
        onSendNotice={noop}
      />
    </ScreenFrame>
  );
}

// Holds the cells, so tapping a cell really cycles its status in the gallery. Every change is a coach correction.
function FulfillmentPreview({ view }: { view: FulfillmentView }) {
  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const [cells, setCells] = useState<Record<string, FulfillmentCell>>(content?.cells ?? {});

  const cycle = (athleteId: string, blockId: string, status: BlockStatus) =>
    setCells((current) => {
      const key = cellKey(athleteId, blockId);
      const block = content?.blocks.find((candidate) => candidate.id === blockId);
      const cell: FulfillmentCell = {
        ...current[key],
        status,
        change: { kind: 'corrected', author: 'Paula G.', dateLabel: '24 oct' },
      };
      // Leaving partial forgets its count; entering it marks half the repetitions. A recorded time count stays but is not shown.
      if (status === 'partial') cell.completedRepetitions = Math.ceil((block?.repetitions ?? 1) / 2);
      else delete cell.completedRepetitions;
      return { ...current, [key]: cell };
    });

  const live: FulfillmentView =
    view.kind === 'data' || view.kind === 'offline' ? { ...view, content: { ...view.content, cells } as FulfillmentContent } : view;
  return (
    <ScreenFrame>
      <FulfillmentScreen
        planName={fulfillmentFixture.planName}
        dateLabel={fulfillmentFixture.dateLabel}
        view={live}
        onCycle={cycle}
        onOpenTiming={noop}
      />
    </ScreenFrame>
  );
}

function PlanListPreview({ view }: { view: PlanListView }) {
  return (
    <ScreenFrame>
      <PlanListScreen view={view} onNewPlan={noop} onUseTemplate={noop} onOpenPlan={noop} />
    </ScreenFrame>
  );
}

function AssignPreview({ view }: { view: AssignPlanView }) {
  return (
    <ScreenFrame>
      <AssignPlanScreen view={view} onPreviousDay={noop} onNextDay={noop} onSelectPlan={noop} onSelectKind={noop} onSelectOption={noop} onAssign={noop} onWithdraw={noop} />
    </ScreenFrame>
  );
}

const assignContent = {
  dateLabel: 'lunes, 2 de noviembre de 2026',
  plans: [...planList.plans, ...planList.templates],
  selectedPlanId: planList.plans[0]?.id ?? null,
  kinds: ['athlete', 'group', 'category', 'school'] as const,
  kind: 'group' as const,
  options: [
    { id: 'g1', label: 'Grupo A' },
    { id: 'g2', label: 'Grupo B' },
  ],
  selectedOptionId: 'g1',
  assigned: [{ id: 'a1', planName: planList.plans[0]?.name ?? '', targetLabel: 'Grupo A', athleteCount: 12, canWithdraw: true }],
  saving: false,
};

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
      rows: () => (
        <Stack>
          {phases.map((phase) => (
            <BlockCard key={phase} variant="row" block={{ ...blocks[2], id: phase, phase }} vocabulary={vocabulary} />
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
    id: 'planList',
    title: 'PlanListScreen',
    states: {
      data: () => <PlanListPreview view={{ kind: 'data', ...planList }} />,
      empty: () => <PlanListPreview view={{ kind: 'data', templates: [], plans: [] }} />,
      loading: () => <PlanListPreview view={{ kind: 'loading' }} />,
      error: () => <PlanListPreview view={{ kind: 'error', onRetry: noop }} />,
      'no-school': () => <PlanListPreview view={{ kind: 'no_school' }} />,
    },
  },
  {
    id: 'assignPlan',
    title: 'AssignPlanScreen',
    states: {
      data: () => <AssignPreview view={{ kind: 'data', content: { ...assignContent, kinds: [...assignContent.kinds] } }} />,
      empty: () => (
        <AssignPreview
          view={{ kind: 'data', content: { ...assignContent, kinds: [...assignContent.kinds], selectedPlanId: null, selectedOptionId: null, assigned: [] } }}
        />
      ),
    },
  },
  {
    id: 'today',
    title: 'TodayScreen',
    states: {
      today: () => <TodayPreview view={{ kind: 'data', content: today }} />,
      'several-athletes': () => <TodayPreview withPicker view={{ kind: 'data', content: today }} />,
      loading: () => <TodayPreview view={{ kind: 'loading' }} />,
      empty: () => <TodayPreview view={{ kind: 'empty' }} />,
      'no-athletes': () => <TodayPreview view={{ kind: 'no-athletes', onOpenAthletes: noop }} />,
      error: () => <TodayPreview view={{ kind: 'error', onRetry: noop }} />,
      offline: () => <TodayPreview view={{ kind: 'offline', storedOnLabel, content: today }} />,
      'offline-empty': () => <TodayPreview view={{ kind: 'offline-empty' }} />,
      denied: () => <TodayPreview view={{ kind: 'denied' }} />,
    },
  },
  {
    id: 'fulfillment',
    title: 'FulfillmentScreen',
    states: {
      grid: () => <FulfillmentPreview view={{ kind: 'data', content: fulfillmentFixture.grid }} />,
      'many-blocks': () => <FulfillmentPreview view={{ kind: 'data', content: fulfillmentFixture.manyBlocks }} />,
      skipped: () => <FulfillmentPreview view={{ kind: 'data', content: fulfillmentFixture.skipped }} />,
      loading: () => <FulfillmentPreview view={{ kind: 'loading' }} />,
      'empty-athletes': () => <FulfillmentPreview view={{ kind: 'data', content: fulfillmentFixture.noAthletes }} />,
      'empty-blocks': () => <FulfillmentPreview view={{ kind: 'data', content: fulfillmentFixture.noBlocks }} />,
      error: () => <FulfillmentPreview view={{ kind: 'error', onRetry: noop }} />,
      offline: () => (
        <FulfillmentPreview
          view={{ kind: 'offline', storedOnLabel: fulfillmentFixture.storedOnLabel, content: fulfillmentFixture.grid }}
        />
      ),
      'offline-empty': () => <FulfillmentPreview view={{ kind: 'offline-empty' }} />,
      denied: () => <FulfillmentPreview view={{ kind: 'denied' }} />,
    },
  },
] satisfies { id: string; title: string; states: Record<string, () => ReactElement> }[];
