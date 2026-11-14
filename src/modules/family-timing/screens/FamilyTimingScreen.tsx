import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ChipRow, IconButton, Segmented, StateView, Tag, TextField, type InitialsDotProps, type SegmentedOption } from '../../../core/ui';
import '../i18n';

export type FamilyAthlete = { id: string; name: string } & InitialsDotProps;

export type FamilyCard = {
  id: string;
  event: string; // "Libre 50 m · Piscina de 25 m"
  detail: string; // "8 nov 2026 · Competencia · Festival"
  captured: string; // formatted, "—" when missing
  // True when an official value exists: the captured competition time is then history, not official.
  capturedIsHistory: boolean;
  official: { label: string; time: string } | null;
  splitsLabel: string | null;
  // Competition cards without an imported official value can take a hand-typed one.
  canSetOfficial: boolean;
  hasManualOfficial: boolean;
};

export type FamilyStopwatchView = {
  status: 'idle' | 'running' | 'stopped';
  time: string;
  splits: string[];
  event: string;
  noTime: boolean;
  /** Which keys time, while the headset or volume keys are on; null otherwise. */
  buttonsHint: string | null;
};

export type FamilySetupView = {
  stroke: { options: SegmentedOption<string>[]; value: string };
  distance: { options: SegmentedOption<string>[]; value: string };
  pool: { options: SegmentedOption<string>[]; value: string };
  sessionType: { options: SegmentedOption<string>[]; value: string };
  competition: string;
};

export type FamilyTimingView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no_athletes' }
  | { kind: 'list'; cards: FamilyCard[] }
  | { kind: 'setup'; setup: FamilySetupView }
  | { kind: 'stopwatch'; stopwatch: FamilyStopwatchView; saveError: boolean }
  | { kind: 'official'; card: FamilyCard; text: string; invalid: boolean };

export type FamilyTimingScreenProps = {
  view: FamilyTimingView;
  athletes: FamilyAthlete[];
  selectedId: string | null;
  onSelectAthlete: (id: string) => void;
  onBack: () => void;
  onRetry: () => void;
  onNew: () => void;
  onSetupChange: (field: 'stroke' | 'distance' | 'pool' | 'sessionType' | 'competition', value: string) => void;
  onGoToStopwatch: () => void;
  onCancel: () => void;
  onStart: () => void;
  onSplit: () => void;
  onStop: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onOpenOfficial: (id: string) => void;
  onOfficialText: (text: string) => void;
  onSaveOfficial: () => void;
  onClearOfficial: () => void;
};

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] }}>
      <IconButton icon="arrow_back" label={t('family_timing.back')} onPress={onBack} />
      <Text accessibilityRole="header" style={[typography.title, { flexShrink: 1, color: colors.ink }]}>
        {title}
      </Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[typography.label, { color: colors['ink-muted'] }]}>{label}</Text>
      {children}
    </View>
  );
}

function Card({ card, onOpenOfficial }: { card: FamilyCard; onOpenOfficial: (id: string) => void }) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}>
      <Text style={[typography['body-strong'], { color: colors.ink }]}>{card.event}</Text>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{card.detail}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2] }}>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
          {t(card.capturedIsHistory ? 'family_timing.card.captured_history' : 'family_timing.card.captured')}
        </Text>
        <Text style={[typography['time-md'], { color: colors[card.capturedIsHistory ? 'ink-muted' : 'ink'] }]}>{card.captured}</Text>
      </View>
      {card.official && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Tag variant="ok" icon="verified_user" label={card.official.label} />
          <Text style={[typography['time-md'], { color: colors.ink }]}>{card.official.time}</Text>
        </View>
      )}
      {card.splitsLabel && <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{card.splitsLabel}</Text>}
      {card.canSetOfficial && (
        <Button
          variant="secondary"
          label={t(card.hasManualOfficial ? 'family_timing.card.edit_official' : 'family_timing.card.set_official')}
          onPress={() => onOpenOfficial(card.id)}
        />
      )}
    </View>
  );
}

function StopwatchBody(props: FamilyTimingScreenProps & { stopwatch: FamilyStopwatchView; saveError: boolean }) {
  const { stopwatch, saveError } = props;
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ alignItems: 'center', gap: space[2], padding: space[6], borderRadius: radius.lg, backgroundColor: colors.header }}>
        <Text style={[typography.caption, { color: colors['on-header-muted'] }]}>{stopwatch.event}</Text>
        <Text
          accessibilityLiveRegion={stopwatch.status === 'running' ? 'none' : 'polite'}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[typography['time-display'], { color: colors['on-header'] }]}
        >
          {stopwatch.time}
        </Text>
        {stopwatch.buttonsHint && (
          <Text style={[typography.caption, { color: colors['on-header-muted'], textAlign: 'center' }]}>{stopwatch.buttonsHint}</Text>
        )}
      </View>
      {stopwatch.noTime && <Banner variant="warn">{t('family_timing.stopwatch.no_time')}</Banner>}
      {saveError && <Banner variant="warn" icon="error">{t('family_timing.save_error')}</Banner>}
      {stopwatch.status === 'idle' && <Button size="timing" label={t('family_timing.stopwatch.start')} onPress={props.onStart} />}
      {stopwatch.status === 'running' && (
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Button size="timing" variant="secondary" label={t('family_timing.stopwatch.split')} onPress={props.onSplit} />
          </View>
          <View style={{ flex: 1 }}>
            <Button size="timing" variant="stop" label={t('family_timing.stopwatch.stop')} onPress={props.onStop} />
          </View>
        </View>
      )}
      {stopwatch.status === 'stopped' && (
        <View style={{ gap: space[3] }}>
          <Button label={t('family_timing.stopwatch.save')} onPress={props.onSave} />
          <Button variant="ghost" label={t('family_timing.stopwatch.discard')} onPress={props.onDiscard} />
        </View>
      )}
      {stopwatch.splits.map((split, index) => (
        <Text key={index} style={[typography['time-sm'], { color: colors.ink }]}>
          {t('family_timing.stopwatch.split_row', { number: index + 1, time: split })}
        </Text>
      ))}
    </View>
  );
}

// Presentational: no database or clock; the container supplies the state and handles the events.
export function FamilyTimingScreen(props: FamilyTimingScreenProps) {
  const { view, athletes, selectedId, onSelectAthlete, onBack } = props;
  const { colors, space } = useTheme();
  const showsAthletes = athletes.length > 1 && selectedId !== null && (view.kind === 'list' || view.kind === 'loading' || view.kind === 'error');

  let body: ReactNode = null;
  switch (view.kind) {
    case 'loading':
      body = <StateView kind="loading" />;
      break;
    case 'error':
      body = (
        <StateView
          kind="error"
          title={t('family_timing.error_title')}
          message={t('family_timing.error_message')}
          action={{ label: t('family_timing.retry'), onPress: props.onRetry }}
        />
      );
      break;
    case 'no_athletes':
      body = <StateView kind="empty" title={t('family_timing.no_athletes_title')} message={t('family_timing.no_athletes_message')} />;
      break;
    case 'list':
      body = (
        <View style={{ gap: space[4] }}>
          <Banner variant="info">{t('family_timing.on_device')}</Banner>
          <Button label={t('family_timing.new')} onPress={props.onNew} />
          {view.cards.length === 0 ? (
            <StateView kind="empty" title={t('family_timing.empty_title')} message={t('family_timing.empty_message')} />
          ) : (
            view.cards.map((card) => <Card key={card.id} card={card} onOpenOfficial={props.onOpenOfficial} />)
          )}
        </View>
      );
      break;
    case 'setup': {
      const { setup } = view;
      body = (
        <View style={{ gap: space[4] }}>
          <Field label={t('family_timing.setup.stroke')}>
            <Segmented accessibilityLabel={t('family_timing.setup.stroke')} {...setup.stroke} onChange={(v) => props.onSetupChange('stroke', v)} />
          </Field>
          <Field label={t('family_timing.setup.distance')}>
            <Segmented accessibilityLabel={t('family_timing.setup.distance')} {...setup.distance} onChange={(v) => props.onSetupChange('distance', v)} />
          </Field>
          <Field label={t('family_timing.setup.pool')}>
            <Segmented accessibilityLabel={t('family_timing.setup.pool')} {...setup.pool} onChange={(v) => props.onSetupChange('pool', v)} />
          </Field>
          <Field label={t('family_timing.setup.session_type')}>
            <Segmented
              accessibilityLabel={t('family_timing.setup.session_type')}
              {...setup.sessionType}
              onChange={(v) => props.onSetupChange('sessionType', v)}
            />
          </Field>
          {setup.sessionType.value === 'competition' && (
            <TextField
              label={t('family_timing.setup.competition')}
              help={t('family_timing.setup.competition_help')}
              value={setup.competition}
              onChangeText={(v) => props.onSetupChange('competition', v)}
            />
          )}
          <Button label={t('family_timing.setup.start')} onPress={props.onGoToStopwatch} />
          <Button variant="ghost" label={t('family_timing.setup.cancel')} onPress={props.onCancel} />
        </View>
      );
      break;
    }
    case 'stopwatch':
      body = <StopwatchBody {...props} stopwatch={view.stopwatch} saveError={view.saveError} />;
      break;
    case 'official':
      body = (
        <View style={{ gap: space[4] }}>
          <Card card={{ ...view.card, canSetOfficial: false }} onOpenOfficial={() => {}} />
          <TextField
            label={t('family_timing.official.label')}
            help={t('family_timing.official.help')}
            error={view.invalid ? t('family_timing.official.invalid') : undefined}
            value={view.text}
            onChangeText={props.onOfficialText}
            keyboardType="numbers-and-punctuation"
            autoFocus
          />
          <Button label={t('family_timing.official.save')} onPress={props.onSaveOfficial} />
          {view.card.hasManualOfficial && <Button variant="secondary" label={t('family_timing.official.clear')} onPress={props.onClearOfficial} />}
          <Button variant="ghost" label={t('family_timing.official.cancel')} onPress={props.onCancel} />
        </View>
      );
      break;
  }

  const title =
    view.kind === 'setup' ? t('family_timing.setup.title') : view.kind === 'official' ? t('family_timing.official.title') : t('family_timing.title');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <Header title={title} onBack={view.kind === 'list' || view.kind === 'loading' || view.kind === 'error' || view.kind === 'no_athletes' ? onBack : props.onCancel} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }} keyboardShouldPersistTaps="handled">
        {showsAthletes && (
          <ChipRow
            accessibilityLabel={t('family_timing.athlete')}
            value={selectedId}
            onChange={onSelectAthlete}
            options={athletes.map(({ id, name, initials, color }) => ({ value: id, label: name, dot: { initials, color } }))}
          />
        )}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}
