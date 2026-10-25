import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, Icon, StateView } from '../../../core/ui';
import '../i18n';
import { BlockCard } from '../components/BlockCard';
import { BlockEditor } from '../components/BlockEditor';
import type { PlanBlock, PlanVocabulary } from '../types';

export type PlanBuilderScreenProps = {
  planName: string;
  blocks: PlanBlock[];
  vocabulary: PlanVocabulary;
  // The block shown with the inline editor instead of its actions.
  editingId?: string | null;
  onAddBlock: () => void;
  onEditBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onChangeBlock: (block: PlanBlock) => void;
  onDoneEditing: () => void;
  onSaveTemplate: () => void;
  // Set to false when a parent ScrollView scrolls instead.
  scrollEnabled?: boolean;
};

// Presentational: the caller owns the blocks and handles every event.
export function PlanBuilderScreen({
  planName,
  blocks,
  vocabulary,
  editingId = null,
  onAddBlock,
  onEditBlock,
  onMoveBlock,
  onChangeBlock,
  onDoneEditing,
  onSaveTemplate,
  scrollEnabled = true,
}: PlanBuilderScreenProps) {
  const { colors, space, typography } = useTheme();

  return (
    // Android needs nestedScrollEnabled for this list to scroll when hosted inside another ScrollView (e.g. the dev gallery preview).
    <ScrollView
      nestedScrollEnabled
      scrollEnabled={scrollEnabled}
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{ padding: space[4], gap: space[4] }}
    >
      <View style={{ gap: space[1] }}>
        <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
          {planName}
        </Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
          {t('training_plans.builder.count', { count: blocks.length })}
        </Text>
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
              <BlockEditor block={block} vocabulary={vocabulary} onChange={onChangeBlock} onDone={onDoneEditing} />
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
              </View>
            )}
          </BlockCard>
        );
      })}
      <Button variant="secondary" label={t('training_plans.builder.add')} onPress={onAddBlock} />
      {blocks.length > 0 && (
        <Button variant="primary" label={t('training_plans.builder.save_template')} onPress={onSaveTemplate} />
      )}
    </ScrollView>
  );
}
