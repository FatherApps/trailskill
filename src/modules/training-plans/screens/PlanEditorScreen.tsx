import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { StateView } from '../../../core/ui';
import type { StaffSchoolRepository } from '../../school-console';
import { BlockHasFulfillmentError, type TrainingPlanRepository } from '../data/plans';
import { blockErrors, hasErrors, newDraftBlock, snapshot, toPlanBlock, type DraftBlock } from '../draft';
import '../i18n';
import type { PlanVocabulary } from '../types';
import { PlanBuilderScreen, type PlanBuilderScreenProps } from './PlanBuilderScreen';

export type PlanEditorScreenProps = {
  // Null creates a new plan.
  planId: string | null;
  repository: TrainingPlanRepository;
  schools: StaffSchoolRepository;
  userId: string;
  vocabulary: PlanVocabulary;
  onSaved?: (planId: string) => void;
  // Opens the assign flow for the saved plan; the editor never saves or assigns by itself. Without it there is no assign button.
  onAssign?: (planId: string) => void;
};

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'no_school' }
  | { kind: 'ready' };

// Container: loads the plan from the local repository, holds the draft, validates and saves.
export function PlanEditorScreen({ planId, repository, schools, userId, vocabulary, onSaved, onAssign }: PlanEditorScreenProps) {
  const { colors, space } = useTheme();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<DraftBlock[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState<'plan' | 'template' | null>(null);
  const [message, setMessage] = useState<PlanBuilderScreenProps['message']>();
  // What is stored for this plan; null until a new plan is first saved. The draft differing from it means unsaved changes.
  const [stored, setStored] = useState<string | null>(null);
  // The plan being edited; a new plan gets its id and school on load, and keeps them after its first save.
  const plan = useRef({ id: '', schoolId: '', isTemplate: false });
  // The plan whose save is running and what it saves. State updates land after the render, so a ref blocks a second press made
  // before the loading state shows; keeping the id, not a flag, means a plan opened during a save does not inherit it, and not
  // the object, because reopening the same plan replaces the object while its save is still running. The kind lets the plan
  // reopened during its own save show the right button as busy.
  const busy = useRef<{ id: string; kind: 'plan' | 'template' } | null>(null);
  // Counts the loads the screen started, of the same plan too (a reopen, a retry, a new user); a save is live only while it has not changed.
  const moves = useRef(0);
  // The id of the plan the screen shows, null while it loads or failed to; it lets a save that is no longer live still tell
  // whether the screen shows its plan again.
  const shown = useRef<string | null>(null);
  // A save that ends after the screen closed must not touch it.
  const mounted = useRef(true);
  // The draft in the form it is compared with `stored`, rebuilt only when it changes.
  const draft = useMemo(() => snapshot(name, blocks), [name, blocks]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // The route swaps /plans/new for the saved id: the draft in memory is already that plan.
    if (planId !== null && planId === plan.current.id) return;
    let cancelled = false;
    // From here the screen no longer shows the plan of a running save, even before the next plan has loaded or if it fails.
    moves.current += 1;
    shown.current = null;
    setLoad({ kind: 'loading' });
    (async () => {
      try {
        if (planId === null) {
          // shortcut: a coach in several schools gets the first one, upgrade with a school selector.
          const [school] = await schools.listStaffSchools(userId);
          if (cancelled) return;
          if (!school) return setLoad({ kind: 'no_school' });
          plan.current = { id: randomUUID(), schoolId: school.id, isTemplate: false };
          setName('');
          setBlocks([]);
          setStored(null);
        } else {
          const existing = await repository.get(planId);
          if (cancelled) return;
          if (!existing) return setLoad({ kind: 'not_found' });
          plan.current = { id: existing.id, schoolId: existing.schoolId, isTemplate: existing.isTemplate };
          setName(existing.name);
          setBlocks(existing.blocks);
          setStored(snapshot(existing.name, existing.blocks));
        }
        setEditingId(null);
        setShowErrors(false);
        setMessage(undefined);
        // A save of this plan still running (the plan was left and reopened) keeps its button busy.
        setSaving(busy.current?.id === plan.current.id ? busy.current.kind : null);
        shown.current = plan.current.id;
        setLoad({ kind: 'ready' });
      } catch {
        if (!cancelled) setLoad({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The vocabulary and the repositories are fixed for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, userId, attempt]);

  if (load.kind !== 'ready') {
    const states = {
      not_found: { title: 'not_found_title', message: 'not_found_message' },
      error: { title: 'error_title', message: 'error_message' },
      no_school: { title: 'no_school_title', message: 'no_school_message' },
    } as const;
    return (
      <View style={{ flex: 1, padding: space[4], backgroundColor: colors['surface-0'] }}>
        {load.kind === 'loading' ? (
          <StateView kind="loading" />
        ) : (
          <StateView
            kind={load.kind === 'error' ? 'error' : 'empty'}
            title={t(`training_plans.load.${states[load.kind].title}`)}
            message={t(`training_plans.load.${states[load.kind].message}`)}
            action={load.kind === 'error' ? { label: t('training_plans.load.retry'), onPress: () => setAttempt((n) => n + 1) } : undefined}
          />
        )}
      </View>
    );
  }

  const editing = blocks.find((block) => block.id === editingId);
  const nameMissing = name.trim() === '';

  // Whether the screen shows the plan `id`, also when it was reopened during a save that started for it.
  const showsPlan = (id: string) => mounted.current && shown.current === id;

  // Saves the plan when the name and every block are valid; otherwise shows what is wrong and writes nothing.
  // `live` tells whether the screen still shows the plan the save started for, once an await has ended.
  // 'left': the plan is saved but the screen moved on, so neither the screen nor `onSaved` hears about it.
  async function persist(live: () => boolean): Promise<'saved' | 'left' | 'failed'> {
    setShowErrors(true);
    const invalid = blocks.find((block) => hasErrors(blockErrors(block, vocabulary)));
    if (nameMissing || invalid) {
      if (invalid) setEditingId(invalid.id);
      setMessage({ kind: 'error', text: t('training_plans.builder.fix_errors') });
      return 'failed';
    }
    const saved = draft;
    const target = plan.current;
    try {
      await repository.save({ ...target, name: name.trim(), blocks: blocks.map(toPlanBlock) });
    } catch (error) {
      const key = error instanceof BlockHasFulfillmentError ? 'block_has_fulfillment' : 'save_failed';
      if (live()) setMessage({ kind: 'error', text: t(`training_plans.builder.${key}`) });
      return 'failed';
    }
    // The plan is saved, but the screen moved on, so it says nothing and `onSaved` is not called. If it shows this plan again
    // (reopened during the save), what is stored is still what this save wrote, and its draft was read before or edited since.
    // shortcut: assumes this save was the last writer, so with another concurrent writer "Assign" could enable over something other than what is stored; upgrade when a plan can have two editors at once.
    if (!live()) {
      if (showsPlan(target.id)) setStored(saved);
      return 'left';
    }
    setStored(saved);
    onSaved?.(plan.current.id);
    return 'saved';
  }

  async function run(kind: 'plan' | 'template') {
    const started = plan.current;
    const movesAtStart = moves.current;
    if (busy.current?.id === started.id) return;
    busy.current = { id: started.id, kind };
    setSaving(kind);
    setMessage(undefined);
    // Not `showsPlan`: it counts loads, not the id, so a save that ends after the same plan was reopened still ends as 'left'.
    const live = () => mounted.current && moves.current === movesAtStart;
    try {
      const result = await persist(live);
      if (result === 'failed') return;
      if (kind === 'plan') {
        if (result === 'saved') setMessage({ kind: 'success', text: t('training_plans.builder.saved') });
        return;
      }
      // A template asked for a saved plan is made even if the screen moved on. It says so only while the screen shows the plan
      // it was made from, also when that plan was reopened during the save; with another plan on screen it says nothing.
      try {
        await repository.copy(started.id, true);
        if (showsPlan(started.id)) setMessage({ kind: 'success', text: t('training_plans.builder.template_saved') });
      } catch {
        if (showsPlan(started.id)) setMessage({ kind: 'error', text: t('training_plans.builder.template_failed') });
      }
    } finally {
      if (busy.current?.id === started.id) busy.current = null;
      // Also when the plan was reopened during the save: its button was left busy for this save.
      if (showsPlan(started.id)) setSaving(null);
    }
  }

  const add = () => {
    const block = newDraftBlock(randomUUID(), vocabulary);
    setBlocks([...blocks, block]);
    setEditingId(block.id);
    setShowErrors(false);
    setMessage(undefined);
  };
  const move = (id: string, direction: 'up' | 'down') => {
    const from = blocks.findIndex((block) => block.id === id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[from], next[to]] = [next[to], next[from]];
    setBlocks(next);
  };

  return (
    <PlanBuilderScreen
      planName={name}
      nameError={showErrors && nameMissing}
      blocks={blocks}
      vocabulary={vocabulary}
      editingId={editingId}
      editingErrors={showErrors && editing ? blockErrors(editing, vocabulary) : undefined}
      message={message}
      saving={saving}
      onChangeName={setName}
      onAddBlock={add}
      onEditBlock={setEditingId}
      onMoveBlock={move}
      onChangeBlock={(changed) => setBlocks(blocks.map((block) => (block.id === changed.id ? changed : block)))}
      onDoneEditing={() => setEditingId(null)}
      onRemoveBlock={(id) => {
        setBlocks(blocks.filter((block) => block.id !== id));
        if (editingId === id) setEditingId(null);
      }}
      onSave={() => run('plan')}
      onSaveTemplate={() => run('template')}
      onAssign={onAssign && (() => onAssign(plan.current.id))}
      assignBlocked={stored !== draft}
    />
  );
}
