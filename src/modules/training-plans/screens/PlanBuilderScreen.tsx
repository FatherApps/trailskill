import { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ConfirmSheet, Icon, StateView, TextField } from '../../../core/ui';
import '../i18n';
import { BlockCard } from '../components/BlockCard';
import { BlockEditor } from '../components/BlockEditor';
import { formatNumber } from '../components/formatNumber';
import type { BlockErrors, DraftBlock } from '../draft';
import type { PlanVocabulary } from '../types';

export type PlanBuilderScreenProps = {
  planName: string;
  // Shows the "write a name" error on the name field.
  nameError?: boolean;
  blocks: DraftBlock[];
  vocabulary: PlanVocabulary;
  // The block shown with the inline editor instead of its actions.
  editingId?: string | null;
  // Field errors of the block being edited.
  editingErrors?: BlockErrors;
  // A result notice (saved, failed), announced politely to screen readers.
  message?: { kind: 'success' | 'error'; text: string };
  saving?: 'plan' | 'template' | null;
  // Opens the remove confirmation on first render; for the dev gallery.
  defaultRemovingId?: string | null;
  onChangeName: (name: string) => void;
  onAddBlock: () => void;
  onEditBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onChangeBlock: (block: DraftBlock) => void;
  onDoneEditing: () => void;
  onRemoveBlock: (id: string) => void;
  onSave: () => void;
  // Without a handler there is no template button.
  onSaveTemplate?: () => void;
  // Set to false when a parent ScrollView scrolls instead.
  scrollEnabled?: boolean;
  // Without a handler there is no assign button; the caller opens its assign flow, this screen never assigns.
  onAssign?: () => void;
  // The plan has changes that are not saved: the assign button stays visible but disabled, and says why.
  assignBlocked?: boolean;
  // The width in dp this screen can use; defaults to the window. From bp-expanded the list and the editing panel sit side by side.
  width?: number;
};

// Presentational: the caller owns the plan and handles every event; only the open remove confirmation is local.
export function PlanBuilderScreen({
  planName,
  nameError = false,
  blocks,
  vocabulary,
  editingId = null,
  editingErrors,
  message,
  saving = null,
  defaultRemovingId = null,
  onChangeName,
  onAddBlock,
  onEditBlock,
  onMoveBlock,
  onChangeBlock,
  onDoneEditing,
  onRemoveBlock,
  onSave,
  onSaveTemplate,
  scrollEnabled = true,
  onAssign,
  assignBlocked = false,
  width,
}: PlanBuilderScreenProps) {
  const { colors, space, radius, breakpoint, typography } = useTheme();
  const window = useWindowDimensions();
  const expanded = (width ?? window.width) >= breakpoint['bp-expanded'];
  const [removingId, setRemovingId] = useState(defaultRemovingId);
  const removingPosition = blocks.findIndex((block) => block.id === removingId) + 1;
  const editingIndex = blocks.findIndex((block) => block.id === editingId);
  const meters = blocks.reduce((sum, block) => sum + block.repetitions * block.distance, 0);

  const editor = (block: DraftBlock) => (
    <BlockEditor block={block} vocabulary={vocabulary} errors={editingErrors} onChange={onChangeBlock} onDone={onDoneEditing} />
  );

  // The card footer: the editor itself in the single column, otherwise the actions. In the wide layout the editor lives in the panel.
  const card = (block: DraftBlock, index: number) => {
    const position = t('training_plans.builder.block_position', { position: index + 1 });
    const isEditing = block.id === editingId;
    return (
      <BlockCard key={block.id} block={block} vocabulary={vocabulary}>
        {isEditing && !expanded ? (
          // The editor texts are ink on surface-1; on the phase fill they would lose contrast (coral, lilac and sky in the dark theme).
          <View
            testID="block-editor-panel"
            style={{ padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}
          >
            {editor(block)}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {!isEditing && (
              <Button
                variant="secondary"
                label={t('training_plans.builder.edit')}
                accessibilityHint={position}
                onPress={() => onEditBlock(block.id)}
              />
            )}
            {/* An action that never applies is hidden, not disabled. */}
            {index > 0 && (
              <Button
                variant="secondary"
                label={t('training_plans.builder.move_up')}
                accessibilityHint={position}
                icon={<Icon name="arrow_upward" size="icon-sm" />}
                onPress={() => onMoveBlock(block.id, 'up')}
              />
            )}
            {index < blocks.length - 1 && (
              <Button
                variant="secondary"
                label={t('training_plans.builder.move_down')}
                accessibilityHint={position}
                icon={<Icon name="arrow_downward" size="icon-sm" />}
                onPress={() => onMoveBlock(block.id, 'down')}
              />
            )}
            <Button
              variant="secondary"
              label={t('training_plans.builder.remove')}
              accessibilityHint={position}
              onPress={() => setRemovingId(block.id)}
            />
          </View>
        )}
      </BlockCard>
    );
  };

  const empty = blocks.length === 0 && (
    <StateView kind="empty" title={t('training_plans.builder.empty_title')} message={t('training_plans.builder.empty_message')} />
  );
  const add = <Button variant="secondary" label={t('training_plans.builder.add')} onPress={onAddBlock} />;

  const save = (
    <Button variant="primary" label={t('training_plans.builder.save')} loading={saving === 'plan'} onPress={onSave} />
  );
  const assign = onAssign && (
    <Button
      variant="secondary"
      label={t('training_plans.builder.assign')}
      disabledReason={assignBlocked ? t('training_plans.builder.assign_blocked') : undefined}
      onPress={onAssign}
    />
  );
  const template = blocks.length > 0 && onSaveTemplate && (
    <Button
      variant="secondary"
      label={t('training_plans.builder.save_template')}
      loading={saving === 'template'}
      onPress={onSaveTemplate}
    />
  );
  const summary = expanded
    ? t('training_plans.today.summary', { meters: formatNumber(meters), count: blocks.length })
    : t('training_plans.builder.count', { count: blocks.length });

  return (
    // Android needs nestedScrollEnabled for this list to scroll when hosted inside another ScrollView (e.g. the dev gallery preview).
    <ScrollView
      nestedScrollEnabled
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{ padding: space[4], gap: space[4] }}
    >
      <View style={{ gap: space[1] }}>
        <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
          {planName.trim() || t('training_plans.builder.untitled')}
        </Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{summary}</Text>
      </View>
      <TextField
        label={t('training_plans.builder.name')}
        placeholder={t('training_plans.builder.name_placeholder')}
        error={nameError ? t('training_plans.builder.name_required') : undefined}
        value={planName}
        onChangeText={onChangeName}
      />
      <View accessibilityLiveRegion="polite">
        {message && (
          <Banner variant={message.kind === 'success' ? 'success' : 'warn'} icon={message.kind === 'success' ? 'check' : 'error'}>
            {message.text}
          </Banner>
        )}
      </View>
      {expanded ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[4] }}>
          <View testID="builder-list" style={{ flex: 1, gap: space[4] }}>
            {empty}
            {blocks.map(card)}
            {add}
          </View>
          <View
            testID="builder-panel"
            style={{ flex: 1, gap: space[4], padding: space[5], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}
          >
            {editingIndex >= 0 ? (
              <>
                <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
                  {t('training_plans.builder.editing_block', { position: editingIndex + 1 })}
                </Text>
                {editor(blocks[editingIndex])}
              </>
            ) : (
              <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('training_plans.builder.pick_block')}</Text>
            )}
          </View>
        </View>
      ) : (
        <>
          {empty}
          {blocks.map(card)}
          {add}
        </>
      )}
      {save}
      {assign}
      {template}
      <ConfirmSheet
        visible={removingId !== null && removingPosition > 0}
        title={t('training_plans.builder.remove_title')}
        message={t('training_plans.builder.remove_message', { position: removingPosition })}
        confirmLabel={t('training_plans.builder.remove_confirm')}
        cancelLabel={t('training_plans.builder.remove_cancel')}
        destructive
        onConfirm={() => {
          if (removingId) onRemoveBlock(removingId);
          setRemovingId(null);
        }}
        onCancel={() => setRemovingId(null)}
      />
    </ScrollView>
  );
}
