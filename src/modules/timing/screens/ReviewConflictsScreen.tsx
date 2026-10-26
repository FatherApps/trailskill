import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Icon, Segmented, StateView, TextField, TimeValue } from '../../../core/ui';
import { conflictEventLabel, formatConflictTime } from '../components/conflictLabels';
import { TimingHeader } from '../components/TimingHeader';
import type { ConflictDecision, ConflictFailure, ConflictVersion, OpenConflict, ResolveConflictInput } from '../data/conflictReview';
import { parseTimeInput } from '../domain/timeInput';
import '../i18n';

export type ReviewConflictsScreenProps = {
  view: 'loading' | 'empty' | 'error' | 'ready';
  conflicts: OpenConflict[];
  // Resolving needs the server: offline, the screen explains it and sends nothing.
  offline: boolean;
  // A resolution is on its way.
  busy?: boolean;
  // Why the last resolution did not go through; what the person typed stays.
  failure?: ConflictFailure | null;
  onResolve: (input: ResolveConflictInput) => void;
  onRetry: () => void;
  onBack: () => void;
  // Opens a conflict's detail from the start (the gallery shows the detail without a tap).
  initialConflictId?: string;
};

function VersionCard({ title, version }: { title: string; version: ConflictVersion }) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ flex: 1, gap: space[1], padding: space[3], borderRadius: radius.sm, backgroundColor: colors['surface-1'] }}>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{title}</Text>
      <TimeValue value={version.hundredths} size="time-md" />
      <Text style={[typography['body-strong'], { color: colors.ink }]}>{version.author ?? t('timing.review.unknown_author')}</Text>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{version.device ?? t('timing.review.unknown_device')}</Text>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{formatConflictTime(version.at)}</Text>
    </View>
  );
}

function ConflictDetail({
  conflict,
  offline,
  busy,
  failure,
  onResolve,
}: { conflict: OpenConflict } & Pick<ReviewConflictsScreenProps, 'offline' | 'busy' | 'failure' | 'onResolve'>) {
  const { space } = useTheme();
  const [decision, setDecision] = useState<ConflictDecision>('current');
  const [valueText, setValueText] = useState('');
  const [reason, setReason] = useState('');
  const [valueUnreadable, setValueUnreadable] = useState(false);
  const [reasonMissing, setReasonMissing] = useState(false);

  function resolve() {
    const trimmed = reason.trim();
    const parsed = decision === 'value' ? parseTimeInput(valueText) : null;
    setReasonMissing(trimmed === '');
    setValueUnreadable(parsed !== null && !parsed.ok);
    if (trimmed === '' || (parsed !== null && !parsed.ok) || offline) return;
    // An empty time field is a missing time (null), never 0.
    onResolve({
      conflictId: conflict.id,
      expectedVersion: conflict.expectedVersion,
      decision,
      hundredths: parsed?.ok ? parsed.value : null,
      reason: trimmed,
    });
  }

  return (
    <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }} keyboardShouldPersistTaps="handled">
      {offline && (
        <Banner variant="warn" icon="wifi_off">
          {t('timing.review.offline')}
        </Banner>
      )}
      {failure && failure !== 'offline' && <Banner variant="warn">{t(`timing.review.failure_${failure}`)}</Banner>}
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <VersionCard title={t('timing.review.current')} version={conflict.current} />
        <VersionCard title={t('timing.review.incoming')} version={conflict.incoming} />
      </View>
      <Segmented
        accessibilityLabel={t('timing.review.decision_label')}
        value={decision}
        onChange={setDecision}
        options={[
          { value: 'current', label: t('timing.review.keep_current') },
          { value: 'incoming', label: t('timing.review.use_incoming') },
          { value: 'value', label: t('timing.review.enter_value') },
        ]}
      />
      {decision === 'value' && (
        <TextField
          label={t('timing.review.value_label')}
          help={t('timing.review.value_help')}
          error={valueUnreadable ? t('timing.review.value_error') : undefined}
          value={valueText}
          onChangeText={setValueText}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
        />
      )}
      <TextField
        label={t('timing.review.reason_label')}
        help={t('timing.review.reason_help')}
        error={reasonMissing ? t('timing.review.reason_error') : undefined}
        value={reason}
        onChangeText={setReason}
      />
      <Button label={t('timing.review.resolve')} loadingLabel={t('timing.review.resolving')} loading={busy} onPress={resolve} />
    </ScrollView>
  );
}

function ConflictRow({ conflict, onPress }: { conflict: OpenConflict; onPress: () => void }) {
  const { colors, space, radius, size, typography } = useTheme();
  const name = conflict.athleteName ?? t('timing.review.unknown_author');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${conflictEventLabel(conflict.event)}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size['target-min'],
        padding: space[3],
        borderRadius: radius.sm,
        backgroundColor: colors['surface-1'],
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography['body-strong'], { color: colors.ink }]}>{name}</Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{conflictEventLabel(conflict.event)}</Text>
      </View>
      <Icon name="chevron_right" />
    </Pressable>
  );
}

export function ReviewConflictsScreen({ view, conflicts, offline, busy, failure, onResolve, onRetry, onBack, initialConflictId }: ReviewConflictsScreenProps) {
  const { colors, space } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(initialConflictId ?? null);
  // A resolved conflict leaves the list, which takes the screen back to it.
  const selected = conflicts.find((conflict) => conflict.id === selectedId) ?? null;

  let body;
  if (view === 'loading') body = <StateView kind="loading" />;
  else if (view === 'empty')
    body = <StateView kind="empty" title={t('timing.review.empty_title')} message={t('timing.review.empty_message')} />;
  else if (view === 'error')
    body = (
      <StateView
        kind="error"
        title={t('timing.review.error_title')}
        message={t('timing.review.error_message')}
        action={{ label: t('timing.review.retry'), onPress: onRetry }}
      />
    );
  else if (selected)
    body = <ConflictDetail key={selected.id} conflict={selected} offline={offline} busy={busy} failure={failure} onResolve={onResolve} />;
  else
    body = (
      <ScrollView contentContainerStyle={{ gap: space[2], padding: space[4] }}>
        {offline && (
          <Banner variant="warn" icon="wifi_off">
            {t('timing.review.offline')}
          </Banner>
        )}
        {conflicts.map((conflict) => (
          <ConflictRow key={conflict.id} conflict={conflict} onPress={() => setSelectedId(conflict.id)} />
        ))}
      </ScrollView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader
        title={t('timing.review.title')}
        subtitle={selected ? `${selected.athleteName ?? ''} · ${conflictEventLabel(selected.event)}`.replace(/^ · /, '') : view === 'ready' ? t('timing.review.subtitle', { count: conflicts.length }) : undefined}
        onBack={selected ? () => setSelectedId(null) : onBack}
      />
      {body}
    </SafeAreaView>
  );
}
