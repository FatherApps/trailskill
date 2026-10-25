import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Button } from '../../../core/ui';
import '../i18n';

export type StopwatchState = 'ready' | 'running' | 'stopped';

export type StopwatchProps = {
  // The clock is drawn from this value only; the container owns the real clock.
  elapsedHundredths: Hundredths;
  state: StopwatchState;
  splits?: { label: string; value: Hundredths }[];
  // `null` or absent means there is no personal best yet.
  bestTime?: Hundredths | null;
  // The container fills this with the difference against the personal best (the TimeValue delta, issue 167).
  pbDelta?: ReactNode;
  onStart: () => void;
  onSplit: () => void;
  onStop: () => void;
  onSave: () => void;
  onDiscard: () => void;
};

export function Stopwatch({
  elapsedHundredths,
  state,
  splits = [],
  bestTime = null,
  pbDelta,
  onStart,
  onSplit,
  onStop,
  onSave,
  onDiscard,
}: StopwatchProps) {
  const { colors, space, typography } = useTheme();
  const running = state === 'running';
  const stopped = state === 'stopped';

  // Screen readers get the state change, never the ticking clock.
  useEffect(() => {
    if (running) AccessibilityInfo.announceForAccessibility(t('timing.stopwatch.announce_running'));
  }, [running]);
  const finalTime = stopped ? elapsedHundredths : null;
  useEffect(() => {
    if (finalTime !== null) {
      AccessibilityInfo.announceForAccessibility(
        t('timing.stopwatch.announce_stopped', { time: formatTime(finalTime) }),
      );
    }
  }, [finalTime]);

  // A stopwatch that has not started has no time: "—", never 0,00.
  const shownTime = state === 'ready' ? null : elapsedHundredths;

  return (
    <View style={{ flex: 1, gap: space[4], padding: space[4], backgroundColor: colors['surface-0'] }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: space[4] }}>
        <Text
          testID="stopwatch-time"
          // The running clock is not a live region and is hidden: only the state is announced.
          {...(running && {
            importantForAccessibility: 'no-hide-descendants' as const,
            accessibilityElementsHidden: true,
          })}
          style={[
            typography['time-display'],
            { textAlign: 'center', fontVariant: ['tabular-nums'], color: colors[state === 'ready' ? 'ink-muted' : 'ink'] },
          ]}
        >
          {formatTime(shownTime)}
        </Text>
        {stopped && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
            <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
              {t('timing.stopwatch.personal_best', { time: formatTime(bestTime) })}
            </Text>
            {pbDelta}
          </View>
        )}
        {splits.length > 0 && (
          <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
            {splits.map((split, index) => (
              <Text
                key={index}
                style={[
                  typography['time-sm'],
                  {
                    paddingVertical: space[2],
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                    fontVariant: ['tabular-nums'],
                    color: colors.ink,
                  },
                ]}
              >
                {t('timing.stopwatch.split_row', { label: split.label, time: formatTime(split.value) })}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
      {state === 'ready' && (
        <Button size="timing" label={t('timing.stopwatch.start')} onPress={onStart} />
      )}
      {running && (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View testID="stopwatch-split-slot" style={{ flex: 1 }}>
            <Button variant="secondary" size="timing" label={t('timing.stopwatch.split')} onPress={onSplit} />
          </View>
          <View testID="stopwatch-stop-slot" style={{ flex: 1.4 }}>
            <Button variant="stop" size="timing" label={t('timing.stopwatch.stop')} onPress={onStop} />
          </View>
        </View>
      )}
      {stopped && (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="timing" label={t('timing.stopwatch.discard')} onPress={onDiscard} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button size="timing" label={t('timing.stopwatch.save')} onPress={onSave} />
          </View>
        </View>
      )}
    </View>
  );
}
