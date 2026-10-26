import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { breakpoint, useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Banner, Button, SyncStatus, type SwimmerRowProps } from '../../../core/ui';
import { useLargeText } from '../components/ActionRow';
import { AssignmentRow } from '../components/AssignmentRow';
import { CompletionRow } from '../components/CompletionRow';
import { NameCard } from '../components/NameCard';
import { OfflineBanner } from '../components/OfflineBanner';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

export type AssignmentAthlete = {
  id: string;
  shortName: string;
  initials: string;
  color: NonNullable<SwimmerRowProps['color']>;
  // For example the lane.
  detail?: string;
  // The personal best for the event, when known; `null` or absent shows nothing.
  bestTime?: Hundredths | null;
};

// `time` is null for an arrival saved without one (never 0). `syncState` is the arrival's own state; the header calls out those that did not go through.
export type AssignmentPosition = { position: number; time: Hundredths | null; athleteId: string | null; syncState?: RecordSyncState };

export type SeriesAssignmentScreenProps = {
  // In arrival order. A position without an athlete stays in the list as "por asignar".
  positions: AssignmentPosition[];
  athletes: AssignmentAthlete[];
  // The series heading, for example "Serie 2 · Libre 50 m".
  heading: string;
  // The position the next card goes to, when it is not the first one without an athlete (for example a reopened one).
  highlightedPosition?: number | null;
  // Assigns the athlete to the highlighted position (the first one without an athlete).
  onAssign: (athleteId: string) => void;
  // Opens an assigned position again.
  onReopen: (position: number) => void;
  onSave: () => void;
  onBack: () => void;
  offline?: boolean;
  // Why the last tap on a card did not go through; absent when there is nothing to say.
  error?: string;
  // Work that only records completion: one switch per athlete instead of times.
  completionOnly?: boolean;
  completedIds?: string[];
  onToggleCompleted?: (athleteId: string) => void;
};

const noop = () => {};

// The gap between cards of the grid and the width of the positions column on the tablet (LSerieAsignar). Layout sizes, not tokens.
const GRID_GAP = 14;
const POSITIONS_WIDTH = 430;

export function SeriesAssignmentScreen({
  positions,
  athletes,
  heading,
  highlightedPosition,
  onAssign,
  onReopen,
  onSave,
  onBack,
  offline = false,
  error,
  completionOnly = false,
  completedIds = [],
  onToggleCompleted = noop,
}: SeriesAssignmentScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const { width } = useWindowDimensions();
  const tablet = width >= breakpoint['bp-medium'];
  const large = useLargeText();

  // Always the first position without an athlete, as in the series rules.
  const highlighted =
    (highlightedPosition === undefined ? positions.find((p) => p.athleteId === null) : positions.find((p) => p.position === highlightedPosition)) ?? null;
  const athleteById = (id: string | null) => athletes.find((a) => a.id === id);
  const assignedCount = positions.filter((p) => p.athleteId !== null).length;
  const syncCount = (state: RecordSyncState) => positions.filter((p) => p.syncState === state).length;
  const notSent = syncCount('not_sent');
  const review = syncCount('needs_review');
  const listStyle = { backgroundColor: colors['surface-1'], borderRadius: radius.md, overflow: 'hidden' } as const;
  const separator = { borderBottomWidth: 1, borderBottomColor: colors.border } as const;

  // Three cards per row on the tablet, two on the phone and one under large text; percentages leave room for the gaps.
  const cardWidth = large ? '100%' : tablet ? '31.5%' : '47.5%';
  const holds = (athleteId: string) => positions.some((p) => p.athleteId === athleteId);
  // The swimmers still without a position come first, as in the design; the ones already placed follow, quiet.
  const cardAthletes = [...athletes].sort((a, b) => Number(holds(a.id)) - Number(holds(b.id)));

  const trailing = (
    <View style={{ gap: space[1], alignItems: tablet ? 'flex-end' : 'flex-start' }}>
      {!completionOnly && (
        <View
          accessible
          accessibilityLabel={t('timing.series.assigned_count', { assigned: assignedCount, total: positions.length })}
          style={{ minHeight: 40, paddingHorizontal: space[4], justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.primary }}
        >
          <Text importantForAccessibility="no" style={[typography.label, { color: colors['on-primary'] }]}>
            {t('timing.series.assigned_count', { assigned: assignedCount, total: positions.length })}
          </Text>
        </View>
      )}
      {notSent > 0 && <SyncStatus state="not_sent" count={notSent} />}
      {review > 0 && <SyncStatus state="needs_review" count={review} />}
    </View>
  );

  const notices = (offline || error) && (
    <View style={{ gap: space[2] }}>
      {offline && <OfflineBanner />}
      {error && (
        <View accessibilityLiveRegion="polite">
          <Banner variant="warn" icon="error">
            {error}
          </Banner>
        </View>
      )}
    </View>
  );

  const rows = (
    <View style={{ gap: space[2] }}>
      {positions.map((p) => {
        const athlete = athleteById(p.athleteId);
        return (
          <AssignmentRow
            key={p.position}
            position={p.position}
            time={p.time}
            athlete={athlete && { shortName: athlete.shortName, initials: athlete.initials, color: athlete.color, bestTime: athlete.bestTime }}
            syncState={p.syncState}
            highlighted={highlighted?.position === p.position}
            onPress={athlete ? () => onReopen(p.position) : undefined}
          />
        );
      })}
    </View>
  );

  const cards = (
    <View style={{ gap: space[3] }}>
      <Text accessibilityRole="header" style={[typography.label, { color: colors.ink }]}>
        {t('timing.series.in_water_title')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
        {cardAthletes.map((athlete) => (
          <View key={athlete.id} style={{ width: cardWidth }}>
            <NameCard
              name={athlete.shortName}
              initials={athlete.initials}
              color={athlete.color}
              bestTime={athlete.bestTime}
              position={positions.find((p) => p.athleteId === athlete.id)?.position}
              onPress={() => onAssign(athlete.id)}
            />
          </View>
        ))}
      </View>
    </View>
  );

  const note = <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('timing.series.assign_note')}</Text>;
  const save = <Button label={t('timing.series.save')} onPress={onSave} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader
        large={tablet}
        title={t('timing.series.assign_heading')}
        subtitle={t('timing.series.assign_subtitle', { event: heading })}
        onBack={onBack}
        trailing={tablet ? trailing : undefined}
      />
      <View style={{ paddingHorizontal: space[4], gap: space[2] }}>{notices}</View>
      {completionOnly ? (
        <ScrollView nestedScrollEnabled contentContainerStyle={{ gap: space[4], padding: space[4] }}>
          <View style={listStyle}>
            {athletes.map((athlete, index) => (
              <View key={athlete.id} style={index < athletes.length - 1 ? separator : undefined}>
                <CompletionRow
                  athlete={athlete}
                  checked={completedIds.includes(athlete.id)}
                  onToggle={() => onToggleCompleted(athlete.id)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : tablet ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: space[5], paddingHorizontal: space[4], paddingBottom: space[4] }}>
          <ScrollView nestedScrollEnabled style={{ width: POSITIONS_WIDTH, flexGrow: 0 }} contentContainerStyle={{ gap: space[3] }}>
            {rows}
            {note}
          </ScrollView>
          <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>
            <ScrollView nestedScrollEnabled style={{ flex: 1 }}>
              {cards}
            </ScrollView>
            <View style={{ alignSelf: 'flex-end', minWidth: 240 }}>{save}</View>
          </View>
        </View>
      ) : (
        <>
          {/* Android needs nestedScrollEnabled for this list to scroll when hosted inside another ScrollView (e.g. the dev gallery preview). */}
          <ScrollView nestedScrollEnabled contentContainerStyle={{ gap: space[4], padding: space[4] }}>
            {trailing}
            {rows}
            {cards}
            {note}
          </ScrollView>
          <View style={{ padding: space[4] }}>{save}</View>
        </>
      )}
      {completionOnly && <View style={{ padding: space[4] }}>{save}</View>}
    </SafeAreaView>
  );
}
