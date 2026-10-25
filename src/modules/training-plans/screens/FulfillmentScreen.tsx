import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, StateView } from '../../../core/ui';
import '../i18n';
import type { FulfillmentContent } from '../components/fulfillment';
import { FulfillmentGrid } from '../components/FulfillmentGrid';
import type { BlockStatus } from '../types';

export type FulfillmentView =
  | { kind: 'data'; content: FulfillmentContent }
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  // Stored data under a dated banner, still interactive: marks are saved on the device. `storedOnLabel` is already formatted by the caller.
  | { kind: 'offline'; storedOnLabel: string; content: FulfillmentContent }
  | { kind: 'offline-empty' }
  | { kind: 'denied' };

export type FulfillmentScreenProps = {
  planName: string;
  // Already formatted by the caller, for example "24 oct".
  dateLabel: string;
  view: FulfillmentView;
  onCycle: (athleteId: string, blockId: string, next: BlockStatus) => void;
  // Set to false when a parent ScrollView scrolls instead.
  scrollEnabled?: boolean;
};

function Content({ content, onCycle }: { content: FulfillmentContent; onCycle: FulfillmentScreenProps['onCycle'] }) {
  const { colors, typography } = useTheme();
  if (content.athletes.length === 0) {
    return (
      <StateView
        kind="empty"
        icon="group"
        title={t('training_plans.fulfillment.empty_athletes_title')}
        message={t('training_plans.fulfillment.empty_athletes_message')}
      />
    );
  }
  if (content.blocks.length === 0) {
    return (
      <StateView
        kind="empty"
        icon="rule"
        title={t('training_plans.fulfillment.empty_blocks_title')}
        message={t('training_plans.fulfillment.empty_blocks_message')}
      />
    );
  }
  return (
    <>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('training_plans.fulfillment.hint')}</Text>
      <FulfillmentGrid {...content} onCycle={onCycle} />
    </>
  );
}

// Presentational (tablet): no network, database or repository; the caller supplies the state and saves the marks.
export function FulfillmentScreen({ planName, dateLabel, view, onCycle, scrollEnabled = true }: FulfillmentScreenProps) {
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
          {planName}
        </Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
          {t('training_plans.fulfillment.caption', { date: dateLabel })}
        </Text>
      </View>
      {view.kind === 'loading' && <StateView kind="loading" />}
      {view.kind === 'error' && (
        <StateView
          kind="error"
          title={t('training_plans.fulfillment.error_title')}
          message={t('training_plans.fulfillment.error_message')}
          action={{ label: t('training_plans.fulfillment.retry'), onPress: view.onRetry }}
        />
      )}
      {view.kind === 'offline-empty' && (
        <StateView
          kind="offline"
          title={t('training_plans.fulfillment.offline_title')}
          message={t('training_plans.fulfillment.offline_message')}
        />
      )}
      {view.kind === 'denied' && (
        <StateView
          kind="denied"
          title={t('training_plans.fulfillment.denied_title')}
          message={t('training_plans.fulfillment.denied_message')}
        />
      )}
      {view.kind === 'offline' && (
        <Banner variant="warn" icon="wifi_off">
          <Text style={typography['body-strong']}>{t('training_plans.fulfillment.banner_title')}</Text>{' '}
          {t('training_plans.fulfillment.banner_dated', { date: view.storedOnLabel })}
        </Banner>
      )}
      {content && <Content content={content} onCycle={onCycle} />}
    </ScrollView>
  );
}
