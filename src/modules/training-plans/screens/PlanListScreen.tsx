import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, StateView } from '../../../core/ui';
import type { PlanSummary } from '../data/plans';
import '../i18n';

export type PlanListView =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'no_school' }
  // `copyingId` is the template whose "Crear plan" is running; `copyFailed` shows the failure notice.
  | { kind: 'data'; templates: PlanSummary[]; plans: PlanSummary[]; copyingId?: string; copyFailed?: boolean };

export type PlanListScreenProps = {
  view: PlanListView;
  onNewPlan: () => void;
  onUseTemplate: (id: string) => void;
  onOpenPlan: (id: string) => void;
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

// Presentational: no repository; the caller supplies the state and handles the events.
export function PlanListScreen({ view, onNewPlan, onUseTemplate, onOpenPlan }: PlanListScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const row = { gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'] };

  return (
    <ScrollView
      nestedScrollEnabled
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{ padding: space[4], gap: space[4] }}
    >
      <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
        {t('training_plans.list.title')}
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
        <StateView
          kind="empty"
          title={t('training_plans.load.no_school_title')}
          message={t('training_plans.load.no_school_message')}
        />
      )}
      {view.kind === 'data' && (
        <>
          <Button label={t('training_plans.list.new')} onPress={onNewPlan} />
          {view.copyFailed && <Banner variant="warn" icon="error">{t('training_plans.list.copy_failed')}</Banner>}
          {view.templates.length === 0 && view.plans.length === 0 && (
            <StateView
              kind="empty"
              title={t('training_plans.list.empty_title')}
              message={t('training_plans.list.empty_message')}
            />
          )}
          {view.templates.length > 0 && (
            <Section title={t('training_plans.list.templates')}>
              {view.templates.map((template) => (
                <View key={template.id} style={row}>
                  <Text style={[typography.subtitle, { color: colors.ink }]}>{template.name}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    <Button
                      variant="secondary"
                      label={t('training_plans.list.use_template')}
                      loading={view.copyingId === template.id}
                      onPress={() => onUseTemplate(template.id)}
                    />
                    <Button variant="secondary" label={t('training_plans.list.edit')} onPress={() => onOpenPlan(template.id)} />
                  </View>
                </View>
              ))}
            </Section>
          )}
          {view.plans.length > 0 && (
            <Section title={t('training_plans.list.plans')}>
              {view.plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  accessibilityRole="button"
                  onPress={() => onOpenPlan(plan.id)}
                  style={[row, { minHeight: 48, justifyContent: 'center' }]}
                >
                  <Text style={[typography.subtitle, { color: colors.ink }]}>{plan.name}</Text>
                </Pressable>
              ))}
            </Section>
          )}
        </>
      )}
    </ScrollView>
  );
}
