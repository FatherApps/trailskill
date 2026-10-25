import { useEffect } from 'react';
import { AccessibilityInfo, ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Button, TimeValue } from '../../../core/ui';
import '../i18n';
import { ActionRow, useLargeText } from './ActionRow';
import { Clock, clockFormat } from './Clock';

export type StopwatchState = 'ready' | 'running' | 'stopped';

export type StopwatchProps = {
  // The clock is drawn from this value only; the container owns the real clock.
  elapsedHundredths: Hundredths;
  state: StopwatchState;
  splits?: { label: string; value: Hundredths }[];
  // `null` or absent means there is no personal best yet.
  bestTime?: Hundredths | null;
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
        t('timing.stopwatch.announce_stopped', { time: formatTime(finalTime, clockFormat) }),
      );
    }
  }, [finalTime]);

  const large = useLargeText();
  return (
    <View style={{ flex: 1, gap: space[4], padding: space[4], backgroundColor: colors['surface-0'] }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: space[4] }}>
        <Clock value={elapsedHundredths} muted={state === 'ready'} hiddenFromReaders={running} />
        {stopped && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[2],
            }}
          >
            <Text style={[typography.caption, { flexShrink: 1, color: colors['ink-muted'] }]}>
              {t('timing.stopwatch.personal_best', { time: formatTime(bestTime) })}
            </Text>
            {/* The clock above is the time: TimeValue only adds the difference and the MP tag. */}
            <TimeValue
              value={elapsedHundredths}
              personalBest={bestTime}
              newPersonalBest={bestTime !== null && elapsedHundredths < bestTime}
              deltaOnly
            />
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
        <ActionRow
          large={large}
          secondary={{ variant: 'secondary', size: 'timing', label: t('timing.stopwatch.split'), onPress: onSplit }}
          primary={{ variant: 'stop', onClock: true, size: 'timing', label: t('timing.stopwatch.stop'), onPress: onStop }}
        />
      )}
      {stopped && (
        <ActionRow
          large={large}
          secondary={{ variant: 'secondary', size: 'timing', label: t('timing.stopwatch.discard'), onPress: onDiscard }}
          primary={{ size: 'timing', label: t('timing.stopwatch.save'), onPress: onSave }}
        />
      )}
    </View>
  );
}
