import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Button, SwimmerRow, TimeValue, type SwimmerRowProps } from '../../../core/ui';
import { useLargeText } from '../components/ActionRow';
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
};

export type AssignmentPosition = { position: number; time: Hundredths; athleteId: string | null };

export type SeriesAssignmentScreenProps = {
  // In arrival order. A position without an athlete stays in the list as "por asignar".
  positions: AssignmentPosition[];
  athletes: AssignmentAthlete[];
  eventSubtitle: string;
  // Assigns the athlete to the highlighted position (the first one without an athlete).
  onAssign: (athleteId: string) => void;
  // Opens an assigned position again.
  onReopen: (position: number) => void;
  onSave: () => void;
  onBack: () => void;
  offline?: boolean;
  // Work that only records completion: one switch per athlete instead of times.
  completionOnly?: boolean;
  completedIds?: string[];
  onToggleCompleted?: (athleteId: string) => void;
};

const noop = () => {};

function CompletionRow({
  athlete,
  checked,
  onToggle,
}: {
  athlete: AssignmentAthlete;
  checked: boolean;
  onToggle: () => void;
}) {
  const { space } = useTheme();

  return (
    <View>
      <SwimmerRow name={athlete.shortName} initials={athlete.initials} color={athlete.color} detail={athlete.detail ?? ''} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3], padding: space[4] }}>
        {/* The Pressable is the switch; the Button only draws it (core has no switch component). */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={t('timing.series.completed_for', { name: athlete.shortName })}
          accessibilityState={{ checked }}
          onPress={onToggle}
        >
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Button variant="secondary" label={t('timing.series.completed')} onPress={noop} />
          </View>
        </Pressable>
        {/* A completion has no time: null never prints 0,00. */}
        {checked && <TimeValue value={null} completed />}
      </View>
    </View>
  );
}

export function SeriesAssignmentScreen({
  positions,
  athletes,
  eventSubtitle,
  onAssign,
  onReopen,
  onSave,
  onBack,
  offline = false,
  completionOnly = false,
  completedIds = [],
  onToggleCompleted = noop,
}: SeriesAssignmentScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const large = useLargeText();

  // Always the first position without an athlete, as in the series rules.
  const highlighted = positions.find((p) => p.athleteId === null) ?? null;
  const athleteById = (id: string | null) => athletes.find((a) => a.id === id);
  const listStyle = { backgroundColor: colors['surface-1'], borderRadius: radius.md, overflow: 'hidden' } as const;
  const separator = { borderBottomWidth: 1, borderBottomColor: colors.border } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.series.assign_title')} subtitle={eventSubtitle} onBack={onBack} />
      {offline && (
        <View style={{ paddingHorizontal: space[4] }}>
          <OfflineBanner />
        </View>
      )}
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        {completionOnly ? (
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
        ) : (
          <>
            <View
              testID="highlighted-stat"
              style={{ backgroundColor: colors['surface-1'], borderRadius: radius.md, padding: space[4], gap: space[1] }}
            >
              {highlighted ? (
                <>
                  <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
                    {t('timing.series.position_of', { position: highlighted.position, total: positions.length })}
                  </Text>
                  <Text style={[typography['time-lg'], { fontVariant: ['tabular-nums'], color: colors.ink }]}>
                    {formatTime(highlighted.time)}
                  </Text>
                </>
              ) : (
                <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('timing.series.all_assigned')}</Text>
              )}
            </View>
            <View style={listStyle}>
              {positions.map((p, index) => {
                const athlete = athleteById(p.athleteId);
                return (
                  <View
                    key={p.position}
                    testID={`position-row-${p.position}`}
                    style={index < positions.length - 1 ? separator : undefined}
                  >
                    {athlete ? (
                      <SwimmerRow
                        name={athlete.shortName}
                        initials={athlete.initials}
                        color={athlete.color}
                        detail={t('timing.series.position_n', { position: p.position })}
                        time={p.time}
                        selected={highlighted?.position === p.position}
                        onPress={() => onReopen(p.position)}
                      />
                    ) : (
                      <SwimmerRow
                        // The short ordinal keeps the name column wide enough not to break mid-word next to the time and tag.
                        name={t('timing.series.position', { position: p.position })}
                        initials={String(p.position)}
                        detail=""
                        time={p.time}
                        tag={{ label: t('timing.series.unassigned'), variant: 'warn' }}
                        selected={highlighted?.position === p.position}
                      />
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('timing.series.whose')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {athletes.map((athlete) => (
                <View key={athlete.id} style={{ flexGrow: 1, flexBasis: large ? '100%' : '45%' }}>
                  <NameCard
                    name={athlete.shortName}
                    color={athlete.color}
                    position={positions.find((p) => p.athleteId === athlete.id)?.position}
                    onPress={() => onAssign(athlete.id)}
                  />
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={{ padding: space[4] }}>
        <Button size="timing" label={t('timing.series.save')} onPress={onSave} />
      </View>
    </SafeAreaView>
  );
}
