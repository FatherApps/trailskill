import { useEffect, useState } from 'react';
import { AccessibilityInfo, PixelRatio, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { typography as baseTypography, useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Button, TimeValue, type ButtonProps } from '../../../core/ui';
import '../i18n';

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

// Same threshold as the athletes HistoryList: from this combined (theme x system) text scale, stack.
const largeTextScale = 1.5;

// The clock always shows minutes, in every state, so it keeps one shape from 0:00,00 on.
const clockFormat = { alwaysShowMinutes: true };

const noop = () => {};

// The secondary button (left) takes its content width and the primary one the rest. If that does not fit, or
// the text is large, they stack full width with the primary on top.
// The natural widths come from a hidden, absolutely positioned copy of the buttons: they do not depend on the
// layout chosen below, so the decision cannot oscillate; it only changes when a measurement does.
function ActionRow({ secondary, primary, large }: { secondary: ButtonProps; primary: ButtonProps; large: boolean }) {
  const { space } = useTheme();
  const [widths, setWidths] = useState<{ container?: number; secondary?: number; primary?: number }>({});
  const measured = (key: 'container' | 'secondary' | 'primary') => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }));
  };

  const { container, secondary: secondaryWidth, primary: primaryWidth } = widths;
  const stacked =
    large ||
    (container !== undefined &&
      secondaryWidth !== undefined &&
      primaryWidth !== undefined &&
      secondaryWidth + space[2] + primaryWidth > container);

  const secondarySlot = (
    <View key="secondary" testID="stopwatch-secondary-slot" style={stacked ? undefined : { flexShrink: 0 }}>
      <Button {...secondary} />
    </View>
  );
  const primarySlot = (
    <View key="primary" testID="stopwatch-primary-slot" style={stacked ? undefined : { flex: 1 }}>
      <Button {...primary} />
    </View>
  );

  return (
    <View testID="stopwatch-actions" onLayout={measured('container')}>
      <View
        testID="stopwatch-measure"
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', flexDirection: 'row', opacity: 0 }}
      >
        <View testID="stopwatch-secondary-measure" onLayout={measured('secondary')} style={{ flexShrink: 0 }}>
          <Button {...secondary} onPress={noop} />
        </View>
        <View testID="stopwatch-primary-measure" onLayout={measured('primary')} style={{ flexShrink: 0 }}>
          <Button {...primary} onPress={noop} />
        </View>
      </View>
      <View
        testID="stopwatch-actions-layout"
        style={{ flexDirection: stacked ? 'column' : 'row', gap: space[2] }}
      >
        {stacked ? [primarySlot, secondarySlot] : [secondarySlot, primarySlot]}
      </View>
    </View>
  );
}

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

  const large =
    (typography.caption.fontSize / baseTypography.caption.fontSize) * PixelRatio.getFontScale() >= largeTextScale;
  return (
    <View style={{ flex: 1, gap: space[4], padding: space[4], backgroundColor: colors['surface-0'] }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: space[4] }}>
        <Text
          testID="stopwatch-time"
          // The only text with a line limit: a 72 sp mono clock at 1.3x (~383 dp for "1:31,45") is wider than a phone's content width and would wrap.
          maxFontSizeMultiplier={1.3}
          adjustsFontSizeToFit
          numberOfLines={1}
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
          {formatTime(elapsedHundredths, clockFormat)}
        </Text>
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
          primary={{ variant: 'stop', size: 'timing', label: t('timing.stopwatch.stop'), onPress: onStop }}
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
