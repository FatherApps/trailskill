import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { StrokeIcon } from '../../../core/ui';
import type { DraftBlock } from '../draft';
import '../i18n';
import type { PlanVocabulary } from '../types';
import { labelOf, strokeOf } from '../vocabulary';
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
  // Only the builder passes it: the card gets a 2 dp border, ink when selected and transparent otherwise, so selecting never moves the content. Without it the card has no border.
  selected?: boolean;
};

// Room kept on the right of a card so the title never sits under its 44 dp icon (12 dp inset + 44 + a gap).
const ICON_RESERVE = 64;

export function BlockCard({ block, vocabulary, children, variant = 'card', trailing, selected }: BlockCardProps) {
  const { colors, space, radius, typography } = useTheme();
  // The card is filled with the colour of its phase, so its text takes the phase's text colour (contrast is pinned in the tests).
  const { background, text } = phaseColors[block.phase];
  const textColor = colors[text];
  const muted = [typography.body, { color: textColor }];
  // The activity is free text (a stroke or a drill): only a stroke has a pictogram, anything else goes without icon.
  const stroke = strokeOf(block.activity);

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
        {/* Decorative: the summary beside it already says the stroke. */}
        {stroke && (
          <View testID="block-stroke-icon" style={{ alignSelf: 'flex-start' }}>
            <StrokeIcon stroke={stroke} size="sm" decorative />
          </View>
        )}
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
      style={[
        { gap: space[2], padding: space[5], borderRadius: radius.md, backgroundColor: colors[background] },
        stroke && { paddingRight: ICON_RESERVE },
        selected !== undefined && { borderWidth: 2, borderColor: selected ? colors.ink : 'transparent' },
      ]}
    >
      {/* The card wears a phase colour, so the icon takes the onColor variant; decorative because the summary below says the stroke. */}
      {stroke && (
        <View testID="block-stroke-icon" style={{ position: 'absolute', top: space[3], right: space[3] }}>
          <StrokeIcon stroke={stroke} variant="onColor" decorative />
        </View>
      )}
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
