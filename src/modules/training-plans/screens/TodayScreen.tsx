import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Banner, Button, StateView, Tag, TimeValue } from '../../../core/ui';
import '../i18n';
import { BlockCard } from '../components/BlockCard';
import { statusTag } from '../components/blockStatus';
import type { BlockStatus, PlanBlock, PlanVocabulary } from '../types';
import { labelOf } from '../vocabulary';

export type TodayBlock = {
  block: PlanBlock;
  status: BlockStatus;
  // For 'partial': "Parcial · 3 de 4". Number of repetitions marked done in the fulfillment record, whether or not their time was recorded
  // (a missing time shows as "—", never zero, and does not change the count). The count never comes from `times`.
  completedRepetitions?: number;
  // Recorded times: one entry per repetition for per_repetition (null = not recorded), at most one for series_total. Ignored for completion blocks.
  times?: (Hundredths | null)[];
};

export type TodayContent = { planName: string; blocks: TodayBlock[]; vocabulary: PlanVocabulary };

export type TodayView =
  | { kind: 'data'; content: TodayContent }
  | { kind: 'loading' }
  // No plan today.
  | { kind: 'empty' }
  | { kind: 'error'; onRetry: () => void }
  // Stored data under a dated banner; `storedOnLabel` is the date already formatted by the caller (for example "25 oct").
  | { kind: 'offline'; storedOnLabel: string; content: TodayContent }
  | { kind: 'offline-empty' }
  | { kind: 'denied' };

export type TodayScreenProps = {
  athleteName: string;
  view: TodayView;
  onReportToCoach: () => void;
  // Set to false when a parent ScrollView scrolls instead.
  scrollEnabled?: boolean;
};

function TimeRow({ label, value }: { label: string; value: Hundredths | null }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
      <Text style={[typography.body, { color: colors['ink-muted'] }]}>{label}</Text>
      <TimeValue value={value} size="time-sm" />
    </View>
  );
}

function BlockStatusAndTimes({ entry }: { entry: TodayBlock }) {
  const { space } = useTheme();
  const times = entry.times ?? [];
  return (
    <View style={{ gap: space[2] }}>
      <Tag {...statusTag({ ...entry, repetitions: entry.block.repetitions })} />
      {/* A completion-only block has no time to show: never a zero. */}
      {entry.block.recording === 'per_repetition' &&
        times.map((time, index) => (
          <TimeRow key={index} label={t('training_plans.today.rep', { n: index + 1 })} value={time} />
        ))}
      {entry.block.recording === 'series_total' && times.length > 0 && (
        <TimeRow label={t('training_plans.today.series_total')} value={times[0]} />
      )}
    </View>
  );
}

function TodayContentView({ content, onReportToCoach }: { content: TodayContent; onReportToCoach: () => void }) {
  const { colors, space, radius, typography } = useTheme();
  const { vocabulary } = content;
  // Each implement once, in first-appearance order.
  const equipment = [...new Set(content.blocks.flatMap(({ block }) => block.equipment))];

  return (
    <>
      <View style={{ gap: space[2], padding: space[5], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{t('training_plans.today.bring_title')}</Text>
        {equipment.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {equipment.map((value) => (
              <Tag key={value} variant="neutral" label={labelOf(vocabulary.equipment, value)} />
            ))}
          </View>
        ) : (
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('training_plans.today.bring_none')}</Text>
        )}
      </View>
      {content.blocks.map((entry) => (
        <BlockCard key={entry.block.id} block={entry.block} vocabulary={vocabulary}>
          <BlockStatusAndTimes entry={entry} />
        </BlockCard>
      ))}
      <Button variant="dark" label={t('training_plans.today.report')} onPress={onReportToCoach} />
    </>
  );
}

// Presentational: no network, database or repository; the caller supplies the state and handles the events.
export function TodayScreen({ athleteName, view, onReportToCoach, scrollEnabled = true }: TodayScreenProps) {
  const { colors, space, typography } = useTheme();
  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;

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
          {t('training_plans.today.title')}
        </Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
          {content
            ? t('training_plans.today.caption', { plan: content.planName, name: athleteName })
            : athleteName}
        </Text>
      </View>
      {view.kind === 'loading' && <StateView kind="loading" />}
      {view.kind === 'empty' && (
        <StateView
          kind="empty"
          icon="schedule"
          title={t('training_plans.today.empty_title')}
          message={t('training_plans.today.empty_message')}
        />
      )}
      {view.kind === 'error' && (
        <StateView
          kind="error"
          title={t('training_plans.today.error_title')}
          message={t('training_plans.today.error_message')}
          action={{ label: t('training_plans.today.retry'), onPress: view.onRetry }}
        />
      )}
      {view.kind === 'offline-empty' && (
        <StateView
          kind="offline"
          title={t('training_plans.today.offline_title')}
          message={t('training_plans.today.offline_message')}
        />
      )}
      {view.kind === 'denied' && (
        <StateView
          kind="denied"
          title={t('training_plans.today.denied_title')}
          message={t('training_plans.today.denied_message', { name: athleteName })}
        />
      )}
      {view.kind === 'offline' && (
        <Banner variant="warn" icon="wifi_off">
          <Text style={typography['body-strong']}>{t('training_plans.today.banner_title')}</Text>{' '}
          {t('training_plans.today.banner_dated', { date: view.storedOnLabel })}
        </Banner>
      )}
      {content && <TodayContentView content={content} onReportToCoach={onReportToCoach} />}
    </ScrollView>
  );
}
