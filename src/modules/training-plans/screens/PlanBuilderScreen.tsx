import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ConfirmSheet, Icon, StateView, TextField } from '../../../core/ui';
import '../i18n';
import { BlockCard } from '../components/BlockCard';
import { BlockEditor } from '../components/BlockEditor';
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
}: PlanBuilderScreenProps) {
  const { colors, space, typography } = useTheme();
  const [removingId, setRemovingId] = useState(defaultRemovingId);
  const removingPosition = blocks.findIndex((block) => block.id === removingId) + 1;

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
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
          {t('training_plans.builder.count', { count: blocks.length })}
        </Text>
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
      {blocks.length === 0 && (
        <StateView
          kind="empty"
          title={t('training_plans.builder.empty_title')}
          message={t('training_plans.builder.empty_message')}
        />
      )}
      {blocks.map((block, index) => {
        const position = t('training_plans.builder.block_position', { position: index + 1 });
        return (
          <BlockCard key={block.id} block={block} vocabulary={vocabulary}>
            {block.id === editingId ? (
              <BlockEditor
                block={block}
                vocabulary={vocabulary}
                errors={editingErrors}
                onChange={onChangeBlock}
                onDone={onDoneEditing}
              />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                <Button
                  variant="secondary"
                  label={t('training_plans.builder.edit')}
                  accessibilityHint={position}
                  onPress={() => onEditBlock(block.id)}
                />
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
      })}
      <Button variant="secondary" label={t('training_plans.builder.add')} onPress={onAddBlock} />
      <Button
        variant="primary"
        label={t('training_plans.builder.save')}
        loading={saving === 'plan'}
        onPress={onSave}
      />
      {blocks.length > 0 && onSaveTemplate && (
        <Button
          variant="secondary"
          label={t('training_plans.builder.save_template')}
          loading={saving === 'template'}
          onPress={onSaveTemplate}
        />
      )}
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
