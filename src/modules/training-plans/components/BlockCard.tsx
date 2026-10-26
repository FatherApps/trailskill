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
import { PhaseTag, phaseColors } from './PhaseTag';

export type BlockCardProps = {
  block: DraftBlock;
  vocabulary: PlanVocabulary;
  // A footer slot: the builder actions, or the Today status and times.
  children?: ReactNode;
  // 'row' is a line inside a card the caller draws: a bar in the colour of the phase, the text, and `trailing` on the right (for example a status).
  variant?: 'card' | 'row';
  trailing?: ReactNode;
};

export function BlockCard({ block, vocabulary, children, variant = 'card', trailing }: BlockCardProps) {
  const { colors, space, radius, typography } = useTheme();
  // The card is filled with the colour of its phase, so its text takes the phase's text colour (contrast is pinned in the tests).
  const { background, text } = phaseColors[block.phase];
  const textColor = colors[text];
  const muted = [typography.body, { color: textColor }];

  if (variant === 'row') {
    // The phase is text in the caption, never the bar colour alone.
    const caption = [
      t(`training_plans.phase.${block.phase}`),
      block.sendOffSeconds !== null && t('training_plans.block.send_off', { time: formatSendOff(block.sendOffSeconds) }),
      block.equipment.length > 0 &&
        t('training_plans.block.equipment', { list: block.equipment.map((value) => labelOf(vocabulary.equipment, value)).join(', ') }),
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <View testID="block-row" style={{ flexDirection: 'row', alignItems: 'stretch', gap: space[3], paddingVertical: space[3] }}>
        {/* The board draws 6; the closest theme step is space[1] (4). */}
        <View
          testID="phase-bar"
          style={{ width: space[1], borderRadius: radius.full, backgroundColor: colors[phaseColors[block.phase].background] }}
        />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text style={[typography['body-strong'], { color: colors.ink }]}>{blockSummary(block, vocabulary)}</Text>
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{caption}</Text>
          {children}
        </View>
        {trailing ? <View style={{ alignSelf: 'flex-start' }}>{trailing}</View> : null}
      </View>
    );
  }

  return (
    <View
      testID="block-card"
      style={{ gap: space[2], padding: space[5], borderRadius: radius.md, backgroundColor: colors[background] }}
    >
      <PhaseTag phase={block.phase} />
      <Text style={[typography.subtitle, { color: textColor }]}>
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
