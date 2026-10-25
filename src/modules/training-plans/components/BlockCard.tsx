import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import type { DraftBlock } from '../draft';
import '../i18n';
import type { PlanVocabulary } from '../types';
import { labelOf } from '../vocabulary';
import { blockSummary } from './blockSummary';
import { formatSendOff } from './formatSendOff';
import { PhaseTag } from './PhaseTag';

export type BlockCardProps = {
  block: DraftBlock;
  vocabulary: PlanVocabulary;
  // A footer slot: the builder actions, or the Today status and times.
  children?: ReactNode;
};

export function BlockCard({ block, vocabulary, children }: BlockCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const muted = [typography.body, { color: colors['ink-muted'] }];

  return (
    <View style={{ gap: space[2], padding: space[5], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}>
      <PhaseTag phase={block.phase} />
      <Text style={[typography.subtitle, { color: colors.ink }]}>
        {blockSummary(block, vocabulary)}
      </Text>
      {block.equipment.length > 0 && (
        <Text style={muted}>
          {t('training_plans.block.equipment', {
            list: block.equipment.map((value) => labelOf(vocabulary.equipment, value)).join(', '),
          })}
        </Text>
      )}
      {block.sendOffSeconds !== null && (
        <Text style={muted}>{t('training_plans.block.send_off', { time: formatSendOff(block.sendOffSeconds) })}</Text>
      )}
      {block.recording && <Text style={muted}>{t(`training_plans.recording.${block.recording}`)}</Text>}
      {children}
    </View>
  );
}
