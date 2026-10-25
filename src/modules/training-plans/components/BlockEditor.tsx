import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, Icon, Segmented, TextField } from '../../../core/ui';
import { isOption, MAX_DRILL_LENGTH, type BlockErrors, type DraftBlock } from '../draft';
import '../i18n';
import type { BlockPhase, BlockRecording, PlanVocabulary } from '../types';
import { formatSendOff } from './formatSendOff';

export type BlockEditorProps = {
  block: DraftBlock;
  vocabulary: PlanVocabulary;
  // Field errors to show; the caller decides when (for example after a failed save).
  errors?: BlockErrors;
  onChange: (block: DraftBlock) => void;
  onDone: () => void;
};

const phases: BlockPhase[] = ['warm_up', 'main', 'technique', 'cool_down'];
const recordings: BlockRecording[] = ['completion', 'per_repetition', 'series_total'];
const SEND_OFF_STEP = 5;
const activityErrors = {
  required: 'training_plans.editor.activity_required',
  too_long: 'training_plans.editor.drill_too_long',
} as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
      {children}
    </View>
  );
}

function FieldError({ message }: { message: string }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[1] }}>
      <Icon name="error" size="icon-sm" color="danger-text" />
      <Text accessibilityLiveRegion="polite" style={[typography.caption, { flexShrink: 1, color: colors['danger-text'] }]}>
        {message}
      </Text>
    </View>
  );
}

function StepButton({ symbol, label, onPress }: { symbol: string; label: string; onPress: () => void }) {
  const { colors, radius, size, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minWidth: size['target-min'],
        minHeight: size['target-min'],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.full,
        backgroundColor: colors['surface-1'],
      }}
    >
      <Text style={[typography['body-strong'], { color: colors.ink }]}>{symbol}</Text>
    </Pressable>
  );
}

function Stepper({ value, lessLabel, moreLabel, onLess, onMore }: {
  value: string;
  lessLabel: string;
  moreLabel: string;
  onLess: () => void;
  onMore: () => void;
}) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
      <StepButton symbol="−" label={lessLabel} onPress={onLess} />
      <Text style={[typography.subtitle, { color: colors.ink }]}>{value}</Text>
      <StepButton symbol="+" label={moreLabel} onPress={onMore} />
    </View>
  );
}

// Controlled: every change goes out through onChange with the whole updated block.
export function BlockEditor({ block, vocabulary, errors = {}, onChange, onDone }: BlockEditorProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const change = (patch: Partial<DraftBlock>) => onChange({ ...block, ...patch });
  const sendOff = block.sendOffSeconds ?? 0;
  // An activity that is not a stroke is the free-text drill; the stroke selector then shows nothing selected.
  const stroke = isOption(vocabulary, block.activity);
  const stepSendOff = (delta: number) => {
    const next = Math.max(0, sendOff + delta);
    change({ sendOffSeconds: next === 0 ? null : next });
  };
  const toggleEquipment = (value: string) =>
    change({
      equipment: block.equipment.includes(value)
        ? block.equipment.filter((item) => item !== value)
        : [...block.equipment, value],
    });

  return (
    <View style={{ gap: space[4] }}>
      <Field label={t('training_plans.editor.phase')}>
        <Segmented
          accessibilityLabel={t('training_plans.editor.phase')}
          options={phases.map((value) => ({ value, label: t(`training_plans.phase.${value}`) }))}
          value={block.phase}
          onChange={(phase) => change({ phase })}
        />
      </Field>
      <Field label={t('training_plans.editor.repetitions')}>
        <Stepper
          value={String(block.repetitions)}
          lessLabel={t('training_plans.editor.less_repetitions')}
          moreLabel={t('training_plans.editor.more_repetitions')}
          onLess={() => change({ repetitions: Math.max(1, block.repetitions - 1) })}
          onMore={() => change({ repetitions: block.repetitions + 1 })}
        />
      </Field>
      <Field label={t('training_plans.editor.distance')}>
        <Segmented
          accessibilityLabel={t('training_plans.editor.distance')}
          options={vocabulary.distances.map((distance) => ({
            value: String(distance),
            label: t('training_plans.editor.distance_option', { distance }),
          }))}
          value={String(block.distance)}
          onChange={(value) => change({ distance: Number(value) })}
        />
      </Field>
      <Field label={t('training_plans.editor.activity')}>
        <Segmented
          accessibilityLabel={t('training_plans.editor.activity')}
          options={vocabulary.activities}
          value={stroke ? block.activity : ''}
          onChange={(activity) => change({ activity })}
        />
      </Field>
      <TextField
        label={t('training_plans.editor.drill')}
        placeholder={t('training_plans.editor.drill_placeholder')}
        help={t('training_plans.editor.drill_help')}
        error={errors.activity ? t(activityErrors[errors.activity]) : undefined}
        maxLength={MAX_DRILL_LENGTH}
        value={stroke ? '' : block.activity}
        onChangeText={(activity) => change({ activity })}
      />
      <Field label={t('training_plans.editor.equipment')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {vocabulary.equipment.map((option) => {
            const selected = block.equipment.includes(option.value);
            const textColor = selected ? colors['on-primary'] : colors.ink;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="checkbox"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                onPress={() => toggleEquipment(option.value)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[2],
                  minHeight: size['target-min'],
                  paddingHorizontal: space[4],
                  borderWidth: 1.5,
                  borderColor: selected ? colors.primary : colors.border,
                  borderRadius: radius.full,
                  backgroundColor: selected ? colors.primary : colors['surface-1'],
                }}
              >
                {selected && <Icon name="check" size="icon-sm" color="on-primary" />}
                <Text style={[typography.label, { flexShrink: 1, color: textColor }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label={t('training_plans.editor.send_off')}>
        <Stepper
          value={block.sendOffSeconds === null ? t('training_plans.editor.no_send_off') : formatSendOff(sendOff)}
          lessLabel={t('training_plans.editor.less_send_off', { seconds: SEND_OFF_STEP })}
          moreLabel={t('training_plans.editor.more_send_off', { seconds: SEND_OFF_STEP })}
          onLess={() => stepSendOff(-SEND_OFF_STEP)}
          onMore={() => stepSendOff(SEND_OFF_STEP)}
        />
      </Field>
      <Field label={t('training_plans.editor.recording')}>
        <Segmented<BlockRecording | ''>
          accessibilityLabel={t('training_plans.editor.recording')}
          options={recordings.map((value) => ({ value, label: t(`training_plans.recording_short.${value}`) }))}
          value={block.recording ?? ''}
          onChange={(recording) => change({ recording: recording || null })}
        />
        {errors.recording && <FieldError message={t('training_plans.editor.recording_required')} />}
      </Field>
      <Button variant="dark" label={t('training_plans.editor.done')} onPress={onDone} />
    </View>
  );
}
