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
  // The plan whose save is running. State updates land after the render, so a ref blocks a second press made before the
  // loading state shows; keeping the plan, not a flag, means a plan opened during a save does not inherit it.
  const busy = useRef<object | null>(null);
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
        setSaving(null);
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
    try {
      await repository.save({ ...plan.current, name: name.trim(), blocks: blocks.map(toPlanBlock) });
    } catch (error) {
      const key = error instanceof BlockHasFulfillmentError ? 'block_has_fulfillment' : 'save_failed';
      if (live()) setMessage({ kind: 'error', text: t(`training_plans.builder.${key}`) });
      return 'failed';
    }
    // The plan is saved, but the screen moved on: what it shows is no longer this plan.
    if (!live()) return 'left';
    setStored(saved);
    onSaved?.(plan.current.id);
    return 'saved';
  }

  async function run(kind: 'plan' | 'template') {
    const started = plan.current;
    if (busy.current === started) return;
    busy.current = started;
    setSaving(kind);
    setMessage(undefined);
    const live = () => mounted.current && plan.current === started;
    try {
      const result = await persist(live);
      if (result === 'failed') return;
      if (kind === 'plan') {
        if (result === 'saved') setMessage({ kind: 'success', text: t('training_plans.builder.saved') });
        return;
      }
      // A template asked for a saved plan is made even if the screen moved on; it says nothing then, there is no screen for it.
      try {
        await repository.copy(started.id, true);
        if (live()) setMessage({ kind: 'success', text: t('training_plans.builder.template_saved') });
      } catch {
        if (live()) setMessage({ kind: 'error', text: t('training_plans.builder.template_failed') });
      }
    } finally {
      if (busy.current === started) busy.current = null;
      if (live()) setSaving(null);
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
