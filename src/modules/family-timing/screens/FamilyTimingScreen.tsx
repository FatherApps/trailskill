import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import {
  Banner,
  Button,
  ChipRow,
  Icon,
  ConfirmSheet,
  IconButton,
  Segmented,
  StateView,
  Tag,
  TextField,
  type ChipRowOption,
  type InitialsDotProps,
  type SegmentedOption,
} from '../../../core/ui';
import { FilterSheet } from '../components/FilterSheet';
import '../i18n';

// A chip of the list: a swimmer (with their dot), or "Sin asignar" (no dot).
export type FamilyAthlete = { id: string; name: string; dot?: InitialsDotProps };

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
  // Several imported official results (or times) of the same event and day: the person picks which result goes with this time.
  officialChoice?: 'choose' | 'change' | null;
  // The best time of its event among the times shown.
  isBest?: boolean;
  // Not given to a swimmer yet ("Sin asignar").
  unassigned?: boolean;
  // Sent to another swimmer's family and waiting for their answer: that swimmer's short name.
  sentTo?: string | null;
};

// Everything known about one saved time, opened by touching its card (#1002).
export type FamilyDetailView = {
  card: FamilyCard;
  rows: { label: string; value: string }[];
  // Each lap's own time and the total at its end; empty for a time without laps.
  laps: { lap: string; total: string }[];
};

// The imported official results that may go with a time: picking one saves it.
export type FamilyChooseOfficialView = {
  card: FamilyCard;
  options: { key: string; time: string; detail: string; selected: boolean }[];
  saveError: boolean;
};

// A time another family sent for the selected swimmer, waiting for this family's answer.
export type FamilyReceivedCard = { id: string; event: string; detail: string; captured: string; splitsLabel: string | null };

export type FamilySendView = {
  card: FamilyCard;
  code: string;
  // The short name of the swimmer with the code, once looked up.
  found: string | null;
  busy: boolean;
  error: string | null;
};

export type FamilyFilterKey = 'sessionType' | 'stroke' | 'distance' | 'pool';
// Each filter: '' is "all"; only the values present in the swimmer's times are offered.
export type FamilyFiltersView = Record<FamilyFilterKey, { options: { value: string; label: string }[]; value: string }>;

// A deleted time in "Eliminados": the card and the day the server removes it for good.
export type FamilyDeletedCard = FamilyCard & { removedOn: string };

export type FamilyEditView = {
  card: FamilyCard;
  stroke: { options: SegmentedOption<string>[]; value: string };
  athlete: { options: ChipRowOption<string>[]; value: string };
  confirmingDelete: boolean;
  saveError: boolean;
  // Sending to another family is offered.
  canSend?: boolean;
};

export type FamilyStopwatchView = {
  status: 'idle' | 'running' | 'stopped';
  time: string;
  // One row per finished lap: its own time and the total so far.
  laps: { lap: string; total: string }[];
  // "Lap 2 de 4" while running; null when the event is a single lap.
  lapProgress: string | null;
  // False when the event is one lap: the stopwatch only starts and stops.
  hasLaps: boolean;
  event: string;
  noTime: boolean;
  /** Which keys time, while the headset or volume keys are on; null otherwise. */
  buttonsHint: string | null;
};

export type FamilySeriesView = {
  status: 'idle' | 'running' | 'done';
  time: string;
  // In arrival order: the first is the first swimmer to touch.
  arrivals: { position: number; time: string }[];
  // "2 de 4 llegadas".
  progress: string;
  event: string;
  /** Which key times, while the headset or volume keys are on; null otherwise. */
  buttonsHint: string | null;
};

export type FamilyLaneView = {
  position: number;
  time: string;
  athlete: { options: ChipRowOption<string>[]; value: string };
  stroke: { options: SegmentedOption<string>[]; value: string };
};

export type FamilySetupView = {
  mode: { options: SegmentedOption<string>[]; value: string };
  // How many swimmers a series has, 2 to 8.
  swimmers: { options: ChipRowOption<string>[]; value: string };
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
  | {
      kind: 'list';
      cards: FamilyCard[];
      deletedCount: number;
      filters: FamilyFiltersView | null;
      filtered: boolean;
      // The notice that explains these times, on the first visit only.
      showNotice?: boolean;
      received?: FamilyReceivedCard[];
      // Why the last answer or withdrawal did not go through.
      transferError?: string | null;
    }
  | { kind: 'send'; send: FamilySendView }
  | { kind: 'deleted'; cards: FamilyDeletedCard[]; restoreError: boolean }
  | { kind: 'detail'; detail: FamilyDetailView }
  | { kind: 'edit'; edit: FamilyEditView }
  | { kind: 'setup'; setup: FamilySetupView }
  | { kind: 'stopwatch'; stopwatch: FamilyStopwatchView; saveError: boolean }
  | { kind: 'series'; series: FamilySeriesView }
  | { kind: 'series_assign'; event: string; lanes: FamilyLaneView[]; saveError: boolean }
  | { kind: 'official'; card: FamilyCard; text: string; invalid: boolean }
  | { kind: 'choose_official'; choose: FamilyChooseOfficialView };

export type FamilyTimingScreenProps = {
  view: FamilyTimingView;
  athletes: FamilyAthlete[];
  selectedId: string | null;
  onSelectAthlete: (id: string) => void;
  onBack: () => void;
  onRetry: () => void;
  onNew: () => void;
  onSetupChange: (field: 'mode' | 'swimmers' | 'stroke' | 'distance' | 'pool' | 'sessionType' | 'competition', value: string) => void;
  onGoToStopwatch: () => void;
  onCancel: () => void;
  onStart: () => void;
  onSplit: () => void;
  onStop: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onOpenOfficial: (id: string) => void;
  onOpenDetail?: (id: string) => void;
  onOpenChooseOfficial?: (id: string) => void;
  onChooseOfficial?: (resultKey: string) => void;
  onOfficialText: (text: string) => void;
  onSaveOfficial: () => void;
  onClearOfficial: () => void;
  onOpenEdit: (id: string) => void;
  onEditChange: (field: 'stroke' | 'athleteId', value: string) => void;
  onSaveEdit: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onOpenDeleted: () => void;
  onRestore: (id: string) => void;
  onFilter: (key: FamilyFilterKey, value: string) => void;
  // Stroke, distance and pool chosen in the sheet, applied together.
  onApplyFilters?: (values: Partial<Record<FamilyFilterKey, string>>) => void;
  // A series: the start, then one arrival per press.
  onSeriesPress: () => void;
  onUndoLast: () => void;
  onAssignSwimmers: () => void;
  onBackToSeries: () => void;
  onLaneChange: (index: number, field: 'athleteId' | 'stroke', value: string) => void;
  onSaveSeries: () => void;
  // Sending a time to another swimmer's family, and answering the ones received.
  onOpenSend?: () => void;
  onSendCode?: (code: string) => void;
  onLookUpCode?: () => void;
  onSendTime?: () => void;
  onWithdraw?: (measurementId: string) => void;
  onAccept?: (transferId: string) => void;
  onReject?: (transferId: string) => void;
};

function Header({ onBack, title, action }: { onBack: () => void; title: string; action?: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] }}>
      <IconButton icon="arrow_back" label={t('family_timing.back')} onPress={onBack} />
      <Text accessibilityRole="header" style={[typography.title, { flex: 1, color: colors.ink }]}>
        {title}
      </Text>
      {action}
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

function Card({
  card,
  onOpenDetail,
  onOpenOfficial,
  onOpenChooseOfficial,
  onOpenEdit,
  onWithdraw,
}: {
  card: FamilyCard;
  onOpenDetail?: (id: string) => void;
  onOpenOfficial?: (id: string) => void;
  onOpenChooseOfficial?: (id: string) => void;
  onOpenEdit?: (id: string) => void;
  onWithdraw?: (id: string) => void;
}) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}>
      {/* Touching the time's information opens its detail; the buttons below keep their own actions. */}
      <Pressable
        disabled={!onOpenDetail}
        accessibilityRole={onOpenDetail ? 'button' : undefined}
        // No label: a screen reader reads the time's information itself, and the hint says touching opens the detail.
        accessibilityHint={onOpenDetail ? t('family_timing.detail.open') : undefined}
        onPress={() => onOpenDetail?.(card.id)}
        style={{ gap: space[2] }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Text style={[typography['body-strong'], { flexShrink: 1, color: colors.ink }]}>{card.event}</Text>
          {card.isBest && <Tag variant="ok" icon="emoji_events" label={t('family_timing.card.best')} />}
        </View>
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
      </Pressable>
      {card.officialChoice && onOpenChooseOfficial && (
        <Button
          variant={card.officialChoice === 'choose' ? 'primary' : 'secondary'}
          label={t(card.officialChoice === 'choose' ? 'family_timing.choose_official.open' : 'family_timing.choose_official.change')}
          onPress={() => onOpenChooseOfficial(card.id)}
        />
      )}
      {card.canSetOfficial && onOpenOfficial && (
        <Button
          variant="secondary"
          label={t(card.hasManualOfficial ? 'family_timing.card.edit_official' : 'family_timing.card.set_official')}
          onPress={() => onOpenOfficial(card.id)}
        />
      )}
      {card.sentTo ? (
        <>
          <Tag variant="warn" icon="schedule" label={t('family_timing.transfer.sent_tag', { name: card.sentTo })} />
          {onWithdraw && <Button variant="ghost" label={t('family_timing.transfer.withdraw')} onPress={() => onWithdraw(card.id)} />}
        </>
      ) : (
        onOpenEdit && <Button variant="ghost" label={t('family_timing.card.edit')} onPress={() => onOpenEdit(card.id)} />
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
      {stopwatch.lapProgress && <Text style={[typography['body-strong'], { color: colors.ink, textAlign: 'center' }]}>{stopwatch.lapProgress}</Text>}
      {stopwatch.status === 'running' && (
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          {stopwatch.hasLaps && (
            <View style={{ flex: 1 }}>
              <Button size="timing" variant="secondary" label={t('family_timing.stopwatch.split')} onPress={props.onSplit} />
            </View>
          )}
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
      {stopwatch.laps.map((row, index) => (
        <Text key={index} style={[typography['time-sm'], { color: colors.ink }]}>
          {t('family_timing.stopwatch.split_row', { number: index + 1, time: row.lap, total: row.total })}
        </Text>
      ))}
    </View>
  );
}

function SeriesBody(props: FamilyTimingScreenProps & { series: FamilySeriesView }) {
  const { series } = props;
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ alignItems: 'center', gap: space[2], padding: space[6], borderRadius: radius.lg, backgroundColor: colors.header }}>
        <Text style={[typography.caption, { color: colors['on-header-muted'] }]}>{series.event}</Text>
        <Text
          accessibilityLiveRegion={series.status === 'running' ? 'none' : 'polite'}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[typography['time-display'], { color: colors['on-header'] }]}
        >
          {series.time}
        </Text>
        <Text style={[typography.caption, { color: colors['on-header-muted'] }]}>{series.progress}</Text>
        {series.buttonsHint && (
          <Text style={[typography.caption, { color: colors['on-header-muted'], textAlign: 'center' }]}>{series.buttonsHint}</Text>
        )}
      </View>
      {series.status === 'idle' && <Button size="timing" label={t('family_timing.stopwatch.start')} onPress={props.onSeriesPress} />}
      {series.status === 'running' && <Button size="timing" variant="stop" label={t('family_timing.series.arrival')} onPress={props.onSeriesPress} />}
      {series.status === 'done' && (
        <>
          <Banner variant="success">{t('family_timing.series.done')}</Banner>
          <Button label={t('family_timing.series.assign')} onPress={props.onAssignSwimmers} />
        </>
      )}
      {series.arrivals.length > 0 && <Button variant="secondary" label={t('family_timing.series.undo')} onPress={props.onUndoLast} />}
      {series.status !== 'idle' && <Button variant="ghost" label={t('family_timing.stopwatch.discard')} onPress={props.onDiscard} />}
      {series.arrivals.map((row) => (
        <Text key={row.position} style={[typography['time-sm'], { color: colors.ink }]}>
          {t('family_timing.series.arrival_row', { position: row.position, time: row.time })}
        </Text>
      ))}
    </View>
  );
}

function SeriesAssignBody(props: FamilyTimingScreenProps & { event: string; lanes: FamilyLaneView[]; saveError: boolean }) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ gap: space[4] }}>
      <Banner variant="info">{t('family_timing.series.assign_info')}</Banner>
      {props.lanes.map((lane, index) => (
        <View
          key={lane.position}
          style={{ gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2] }}>
            <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('family_timing.series.lane_title', { position: lane.position })}</Text>
            <Text style={[typography['time-md'], { color: colors.ink }]}>{lane.time}</Text>
          </View>
          <Field label={t('family_timing.athlete')}>
            <ChipRow
              accessibilityLabel={t('family_timing.series.lane_athlete', { position: lane.position })}
              {...lane.athlete}
              onChange={(v) => props.onLaneChange(index, 'athleteId', v)}
            />
          </Field>
          <Field label={t('family_timing.setup.stroke')}>
            <Segmented
              accessibilityLabel={t('family_timing.series.lane_stroke', { position: lane.position })}
              {...lane.stroke}
              onChange={(v) => props.onLaneChange(index, 'stroke', v)}
            />
          </Field>
        </View>
      ))}
      {props.saveError && (
        <Banner variant="warn" icon="error">
          {t('family_timing.series.save_error')}
        </Banner>
      )}
      <Button label={t('family_timing.series.save')} onPress={props.onSaveSeries} />
      <Button variant="ghost" label={t('family_timing.series.back_to_series')} onPress={props.onBackToSeries} />
    </View>
  );
}

// Presentational: no database or clock; the container supplies the state and handles the events.
export function FamilyTimingScreen(props: FamilyTimingScreenProps) {
  const { view, athletes, selectedId, onSelectAthlete, onBack } = props;
  const { colors, space, radius, typography } = useTheme();
  const [filtering, setFiltering] = useState(false);
  // Stroke, distance and pool open in a sheet from the header; a section shows only when it has more than one value to choose.
  const sheetSections =
    view.kind === 'list' && view.filters
      ? (['stroke', 'distance', 'pool'] as const).flatMap((key) => {
          const filter = view.filters?.[key];
          return filter && filter.options.length > 2 ? [{ key, label: t(`family_timing.filters.${key}`), ...filter }] : [];
        })
      : [];
  const activeInSheet = sheetSections.filter((s) => s.value !== '').length;
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
          {view.showNotice && <Banner variant="info">{t('family_timing.on_device')}</Banner>}
          {view.transferError && (
            <Banner variant="warn" icon="error">
              {view.transferError}
            </Banner>
          )}
          {view.received?.map((r) => (
            <View
              key={r.id}
              style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}
            >
              <Tag variant="info" icon="family_restroom" label={t('family_timing.transfer.received_tag')} />
              <Text style={[typography['body-strong'], { color: colors.ink }]}>{r.event}</Text>
              <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{r.detail}</Text>
              <Text style={[typography['time-md'], { color: colors.ink }]}>{r.captured}</Text>
              {r.splitsLabel && <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{r.splitsLabel}</Text>}
              <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('family_timing.transfer.received_help')}</Text>
              <Button label={t('family_timing.transfer.accept')} onPress={() => props.onAccept?.(r.id)} />
              <Button variant="secondary" label={t('family_timing.transfer.reject')} onPress={() => props.onReject?.(r.id)} />
            </View>
          ))}
          <Button label={t('family_timing.new')} onPress={props.onNew} />
          {view.filters && (
            <Segmented
              accessibilityLabel={t('family_timing.filters.session_type')}
              {...view.filters.sessionType}
              onChange={(v) => props.onFilter('sessionType', v)}
            />
          )}
          {view.cards.length === 0 ? (
            view.filtered ? (
              <StateView kind="empty" title={t('family_timing.filters.empty_title')} message={t('family_timing.filters.empty_message')} />
            ) : (
              <StateView kind="empty" title={t('family_timing.empty_title')} message={t('family_timing.empty_message')} />
            )
          ) : (
            view.cards.map((card) => (
              <Card key={card.id} card={card} onOpenDetail={props.onOpenDetail} onOpenOfficial={props.onOpenOfficial} onOpenChooseOfficial={props.onOpenChooseOfficial} onOpenEdit={props.onOpenEdit} onWithdraw={props.onWithdraw} />
            ))
          )}
          {view.deletedCount > 0 && (
            <Button variant="ghost" label={t('family_timing.deleted.open', { count: view.deletedCount })} onPress={props.onOpenDeleted} />
          )}
        </View>
      );
      break;
    case 'detail': {
      const detail = view.detail;
      body = (
        <View style={{ gap: space[4] }}>
          <Card card={detail.card} onOpenOfficial={props.onOpenOfficial} onOpenEdit={props.onOpenEdit} onWithdraw={props.onWithdraw} />
          <View style={{ gap: space[3] }}>
            {detail.rows.map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space[2] }}>
                <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{row.label}</Text>
                <Text style={[typography.body, { flexShrink: 1, color: colors.ink }]}>{row.value}</Text>
              </View>
            ))}
          </View>
          {detail.laps.length > 0 && (
            <View style={{ gap: space[2] }}>
              <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
                {t('family_timing.detail.laps')}
              </Text>
              {detail.laps.map((row, index) => (
                <Text key={index} style={[typography['time-sm'], { color: colors.ink }]}>
                  {t('family_timing.stopwatch.split_row', { number: index + 1, time: row.lap, total: row.total })}
                </Text>
              ))}
            </View>
          )}
          <Button variant="ghost" label={t('family_timing.detail.back')} onPress={props.onCancel} />
        </View>
      );
      break;
    }
    case 'deleted':
      body = (
        <View style={{ gap: space[4] }}>
          <Banner variant="info">{t('family_timing.deleted.info')}</Banner>
          {view.restoreError && (
            <Banner variant="warn" icon="error">
              {t('family_timing.deleted.restore_error')}
            </Banner>
          )}
          {view.cards.length === 0 ? (
            <StateView kind="empty" title={t('family_timing.deleted.empty_title')} message={t('family_timing.deleted.empty_message')} />
          ) : (
            view.cards.map((card) => (
              <View key={card.id} style={{ gap: space[2] }}>
                <Card card={card} />
                <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('family_timing.deleted.removed_on', { date: card.removedOn })}</Text>
                <Button variant="secondary" label={t('family_timing.deleted.restore')} onPress={() => props.onRestore(card.id)} />
              </View>
            ))
          )}
        </View>
      );
      break;
    case 'edit': {
      const { edit } = view;
      body = (
        <View style={{ gap: space[4] }}>
          <Card card={edit.card} />
          <Field label={t('family_timing.setup.stroke')}>
            <Segmented accessibilityLabel={t('family_timing.setup.stroke')} {...edit.stroke} onChange={(v) => props.onEditChange('stroke', v)} />
          </Field>
          {edit.athlete.options.length > 1 && (
            <Field label={t('family_timing.athlete')}>
              <ChipRow accessibilityLabel={t('family_timing.athlete')} {...edit.athlete} onChange={(v) => props.onEditChange('athleteId', v)} />
            </Field>
          )}
          {edit.saveError && (
            <Banner variant="warn" icon="error">
              {t('family_timing.save_error')}
            </Banner>
          )}
          <Button label={t('family_timing.edit.save')} onPress={props.onSaveEdit} />
          {edit.canSend && <Button variant="secondary" label={t('family_timing.transfer.open')} onPress={() => props.onOpenSend?.()} />}
          <Button variant="secondary" label={t('family_timing.edit.delete')} onPress={props.onAskDelete} />
          <Button variant="ghost" label={t('family_timing.edit.cancel')} onPress={props.onCancel} />
          <ConfirmSheet
            visible={edit.confirmingDelete}
            title={t('family_timing.edit.delete_title')}
            message={t('family_timing.edit.delete_message')}
            confirmLabel={t('family_timing.edit.delete_confirm')}
            cancelLabel={t('family_timing.edit.delete_cancel')}
            destructive
            onConfirm={props.onConfirmDelete}
            onCancel={props.onCancelDelete}
          />
        </View>
      );
      break;
    }
    case 'setup': {
      const { setup } = view;
      const series = setup.mode.value === 'series';
      body = (
        <View style={{ gap: space[4] }}>
          <Segmented accessibilityLabel={t('family_timing.setup.mode')} {...setup.mode} onChange={(v) => props.onSetupChange('mode', v)} />
          {series && (
            <Field label={t('family_timing.setup.swimmers')}>
              <ChipRow accessibilityLabel={t('family_timing.setup.swimmers')} {...setup.swimmers} onChange={(v) => props.onSetupChange('swimmers', v)} />
            </Field>
          )}
          <Field label={t(series ? 'family_timing.setup.stroke_series' : 'family_timing.setup.stroke')}>
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
          <Button
            label={t('family_timing.setup.start')}
            onPress={props.onGoToStopwatch}
            disabledReason={setup.pool.value ? undefined : t('family_timing.setup.pool_required')}
          />
          <Button variant="ghost" label={t('family_timing.setup.cancel')} onPress={props.onCancel} />
        </View>
      );
      break;
    }
    case 'stopwatch':
      body = <StopwatchBody {...props} stopwatch={view.stopwatch} saveError={view.saveError} />;
      break;
    case 'series':
      body = <SeriesBody {...props} series={view.series} />;
      break;
    case 'series_assign':
      body = <SeriesAssignBody {...props} event={view.event} lanes={view.lanes} saveError={view.saveError} />;
      break;
    case 'send': {
      const { send } = view;
      body = (
        <View style={{ gap: space[4] }}>
          <Card card={send.card} />
          <TextField
            label={t('family_timing.transfer.code_label')}
            help={t('family_timing.transfer.code_help')}
            value={send.code}
            onChangeText={(v) => props.onSendCode?.(v)}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />
          {send.error && (
            <Banner variant="warn" icon="error">
              {send.error}
            </Banner>
          )}
          {send.found ? (
            <>
              <Banner variant="info">{t('family_timing.transfer.found', { name: send.found })}</Banner>
              <Button label={t('family_timing.transfer.send', { name: send.found })} onPress={() => props.onSendTime?.()} loading={send.busy} />
            </>
          ) : (
            <Button
              label={t('family_timing.transfer.look_up')}
              onPress={() => props.onLookUpCode?.()}
              loading={send.busy}
              disabledReason={send.code.trim() ? undefined : t('family_timing.transfer.code_required')}
            />
          )}
          <Button variant="ghost" label={t('family_timing.edit.cancel')} onPress={props.onCancel} />
        </View>
      );
      break;
    }
    case 'choose_official': {
      const choose = view.choose;
      body = (
        <View style={{ gap: space[4] }}>
          <Card card={choose.card} />
          <Text style={[typography.body, { color: colors.ink }]}>{t('family_timing.choose_official.help')}</Text>
          {choose.saveError && (
            <Banner variant="warn" icon="error">
              {t('family_timing.choose_official.error')}
            </Banner>
          )}
          {choose.options.map((option) => (
            <Button
              key={option.key}
              variant={option.selected ? 'primary' : 'secondary'}
              label={t('family_timing.choose_official.option', { time: option.time, detail: option.detail })}
              onPress={() => props.onChooseOfficial?.(option.key)}
            />
          ))}
          <Button variant="ghost" label={t('family_timing.official.cancel')} onPress={props.onCancel} />
        </View>
      );
      break;
    }
    case 'official':
      body = (
        <View style={{ gap: space[4] }}>
          <Card card={view.card} />
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

  const titles: Partial<Record<FamilyTimingView['kind'], string>> = {
    setup: t('family_timing.setup.title'),
    official: t('family_timing.official.title'),
    detail: t('family_timing.detail.title'),
    choose_official: t('family_timing.choose_official.title'),
    edit: t('family_timing.edit.title'),
    deleted: t('family_timing.deleted.title'),
    send: t('family_timing.transfer.title'),
    series: t('family_timing.series.title'),
    series_assign: t('family_timing.series.assign_title'),
  };
  const title = titles[view.kind] ?? t('family_timing.title');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <Header
        title={title}
        action={
          sheetSections.length > 0 ? (
            <Button
              variant={activeInSheet > 0 ? 'primary' : 'secondary'}
              icon={<Icon name="expand_more" size="icon-sm" color={activeInSheet > 0 ? 'on-primary' : 'ink'} />}
              label={activeInSheet > 0 ? t('family_timing.filters.open_active', { count: activeInSheet }) : t('family_timing.filters.open')}
              onPress={() => setFiltering(true)}
            />
          ) : undefined
        }
        onBack={
          view.kind === 'list' || view.kind === 'loading' || view.kind === 'error' || view.kind === 'no_athletes'
            ? onBack
            : view.kind === 'series_assign'
              ? props.onBackToSeries
              : props.onCancel
        }
      />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4], paddingBottom: space[12] * 2 }} keyboardShouldPersistTaps="handled">
        {showsAthletes && (
          <ChipRow
            accessibilityLabel={t('family_timing.athlete')}
            value={selectedId}
            onChange={onSelectAthlete}
            options={athletes.map(({ id, name, dot }) => ({ value: id, label: name, dot }))}
          />
        )}
        {body}
      </ScrollView>
      {/* Mounted on opening, so each opening starts from the filters in use. */}
      {filtering && sheetSections.length > 0 && (
        <FilterSheet
          visible
          sections={sheetSections}
          onClose={() => setFiltering(false)}
          onApply={(values) => {
            setFiltering(false);
            props.onApplyFilters?.(values);
          }}
        />
      )}
    </SafeAreaView>
  );
}
