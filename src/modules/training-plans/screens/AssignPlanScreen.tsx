import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ConfirmSheet, Segmented, StateView, Tag } from '../../../core/ui';
import type { AssignmentTarget } from '../data/assignments';
import type { PlanSummary } from '../data/plans';
import '../i18n';

export type AssignmentKind = AssignmentTarget['kind'];
export type AssignOption = { id: string; label: string };
export type AssignedRow = { id: string; planName: string; targetLabel: string; athleteCount: number; canWithdraw: boolean };

export type AssignPlanContent = {
  // The day, already formatted for reading (for example "lunes 2 de noviembre").
  dateLabel: string;
  plans: PlanSummary[];
  selectedPlanId: string | null;
  // The kinds of target the user may assign; the school kind needs no option.
  kinds: AssignmentKind[];
  kind: AssignmentKind;
  // What can be picked for the kind; empty for the school kind.
  options: AssignOption[];
  selectedOptionId: string | null;
  // Null while the day loads: the list shows the loading state and the Assign button waits, as when saving.
  assigned: AssignedRow[] | null;
  saving: boolean;
  // 'denied': the plan or the target is not assignable; 'save' and 'withdraw': anything else, saving or withdrawing.
  failure?: 'denied' | 'save' | 'withdraw';
};

export type AssignPlanView =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'no_school' }
  | { kind: 'data'; content: AssignPlanContent };

export type AssignPlanScreenProps = {
  view: AssignPlanView;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onSelectPlan: (id: string) => void;
  onSelectKind: (kind: AssignmentKind) => void;
  onSelectOption: (id: string) => void;
  onAssign: () => void;
  onWithdraw: (id: string) => void;
  // Opens the fulfillment grid of an assigned plan; without it the rows have no such button.
  onOpenFulfillment?: (id: string) => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Choice({ label, selected, onPress, tag }: { label: string; selected: boolean; onPress: () => void; tag?: string }) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[2],
        padding: space[4],
        borderRadius: radius.md,
        backgroundColor: colors[selected ? 'primary' : 'surface-1'],
      }}
    >
      <Text style={[typography.subtitle, { color: colors[selected ? 'on-primary' : 'ink'], flexShrink: 1 }]}>{label}</Text>
      {tag ? <Tag variant="neutral" label={tag} /> : null}
    </Pressable>
  );
}

function AssignForm({
  content,
  onPreviousDay,
  onNextDay,
  onSelectPlan,
  onSelectKind,
  onSelectOption,
  onAssign,
  onWithdraw,
  onOpenFulfillment,
}: { content: AssignPlanContent } & Omit<AssignPlanScreenProps, 'view'>) {
  const { colors, space, radius, typography } = useTheme();
  const [withdrawing, setWithdrawing] = useState<AssignedRow | null>(null);
  const ready = content.selectedPlanId !== null && (content.kind === 'school' || content.selectedOptionId !== null);
  return (
    <>
      <Section title={t('training_plans.assign.date')}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{content.dateLabel}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button variant="secondary" label={t('training_plans.assign.previous_day')} onPress={onPreviousDay} />
          <Button variant="secondary" label={t('training_plans.assign.next_day')} onPress={onNextDay} />
        </View>
      </Section>

      <Section title={t('training_plans.assign.plan')}>
        {content.plans.length === 0 ? (
          <StateView kind="empty" title={t('training_plans.list.empty_title')} message={t('training_plans.list.empty_message')} />
        ) : (
          content.plans.map((plan) => (
            <Choice
              key={plan.id}
              label={plan.name}
              tag={plan.isTemplate ? t('training_plans.assign.template') : undefined}
              selected={plan.id === content.selectedPlanId}
              onPress={() => onSelectPlan(plan.id)}
            />
          ))
        )}
      </Section>

      <Section title={t('training_plans.assign.target')}>
        <Segmented
          accessibilityLabel={t('training_plans.assign.target')}
          options={content.kinds.map((value) => ({ value, label: t(`training_plans.assign.kind.${value}`) }))}
          value={content.kind}
          onChange={onSelectKind}
        />
        {content.kind === 'school' ? (
          <Text style={[typography.body, { color: colors.ink }]}>{t('training_plans.assign.school_all')}</Text>
        ) : content.options.length === 0 ? (
          <Text style={[typography.body, { color: colors.ink }]}>{t(`training_plans.assign.none.${content.kind}`)}</Text>
        ) : (
          content.options.map((option) => (
            <Choice key={option.id} label={option.label} selected={option.id === content.selectedOptionId} onPress={() => onSelectOption(option.id)} />
          ))
        )}
      </Section>

      {content.failure && (
        <Banner variant="warn" icon="error">
          {t(`training_plans.assign.failure.${content.failure}`)}
        </Banner>
      )}
      <Button
        label={t('training_plans.assign.save')}
        loading={content.saving || content.assigned === null}
        disabledReason={ready ? undefined : t('training_plans.assign.not_ready')}
        onPress={onAssign}
      />

      <Section title={t('training_plans.assign.assigned')}>
        {content.assigned === null ? (
          <StateView kind="loading" />
        ) : content.assigned.length === 0 ? (
          <Text style={[typography.body, { color: colors.ink }]}>{t('training_plans.assign.assigned_empty')}</Text>
        ) : (
          content.assigned.map((row) => (
            <View testID={`assigned-${row.id}`} key={row.id} style={{ gap: space[1], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}>
              <Text style={[typography.subtitle, { color: colors.ink }]}>{row.planName}</Text>
              <Text style={[typography.body, { color: colors.ink }]}>{row.targetLabel}</Text>
              <Text style={[typography.body, { color: colors.ink }]}>{t('training_plans.assign.reaches', { count: row.athleteCount })}</Text>
              {onOpenFulfillment && <Button label={t('training_plans.assign.open_fulfillment')} onPress={() => onOpenFulfillment(row.id)} />}
              {row.canWithdraw && <Button variant="secondary" label={t('training_plans.assign.withdraw')} onPress={() => setWithdrawing(row)} />}
            </View>
          ))
        )}
      </Section>

      <ConfirmSheet
        visible={withdrawing !== null}
        title={t('training_plans.assign.withdraw_title')}
        message={t('training_plans.assign.withdraw_message', { plan: withdrawing?.planName ?? '', target: withdrawing?.targetLabel ?? '' })}
        confirmLabel={t('training_plans.assign.withdraw_confirm')}
        cancelLabel={t('training_plans.assign.withdraw_cancel')}
        destructive
        onConfirm={() => {
          if (withdrawing) onWithdraw(withdrawing.id);
          setWithdrawing(null);
        }}
        onCancel={() => setWithdrawing(null)}
      />
    </>
  );
}

// Presentational: no repository; the caller supplies the state and handles the events.
export function AssignPlanScreen({ view, onPreviousDay, onNextDay, onSelectPlan, onSelectKind, onSelectOption, onAssign, onWithdraw, onOpenFulfillment }: AssignPlanScreenProps) {
  const { colors, space, typography } = useTheme();

  return (
    <ScrollView nestedScrollEnabled style={{ backgroundColor: colors['surface-0'] }} contentContainerStyle={{ padding: space[4], gap: space[4] }}>
      <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
        {t('training_plans.assign.title')}
      </Text>
      {view.kind === 'loading' && <StateView kind="loading" />}
      {view.kind === 'error' && (
        <StateView
          kind="error"
          title={t('training_plans.load.list_error_title')}
          message={t('training_plans.load.error_message')}
          action={{ label: t('training_plans.load.retry'), onPress: view.onRetry }}
        />
      )}
      {view.kind === 'no_school' && (
        <StateView kind="empty" title={t('training_plans.load.no_school_title')} message={t('training_plans.load.no_school_message')} />
      )}
      {view.kind === 'data' && (
        <AssignForm
          content={view.content}
          onPreviousDay={onPreviousDay}
          onNextDay={onNextDay}
          onSelectPlan={onSelectPlan}
          onSelectKind={onSelectKind}
          onSelectOption={onSelectOption}
          onAssign={onAssign}
          onWithdraw={onWithdraw}
          onOpenFulfillment={onOpenFulfillment}
        />
      )}
    </ScrollView>
  );
}
