import type { ReactNode } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, IconButton, Tag } from '../../../core/ui';
import '../i18n';

export type VideoStopwatchView = {
  event: string;
  /** Asking for the camera, microphone and gallery permissions; then ready. */
  phase: 'asking' | 'ready';
  status: 'idle' | 'running' | 'stopped';
  time: string;
  recording: boolean;
  /** "00:18" while recording. */
  recordingTime: string | null;
  cameraReady: boolean;
  /** Iniciar can be pressed: the video records, or "mismo botón" starts both. */
  canStart: boolean;
  startWithTime: boolean;
  hasLaps: boolean;
  lapProgress: string | null;
  laps: { lap: string; total: string }[];
  noTime: boolean;
  lowSpace: boolean;
  /** The time is saved; the video still records its last seconds. */
  savingVideo: boolean;
  saveError: boolean;
  buttonsHint: string | null;
};

export type VideoStopwatchScreenProps = {
  view: VideoStopwatchView;
  /** The camera's live image, filling its frame. */
  preview: ReactNode;
  onBack: () => void;
  onRecord: () => void;
  onStopRecording: () => void;
  onStart: () => void;
  onSplit: () => void;
  onStop: () => void;
  onSave: () => void;
  onDiscard: () => void;
};

// Presentational. The camera fills its own frame and the controls sit beside it (landscape) or under it (portrait), on the
// design system's surfaces: nothing is drawn over the image.
export function VideoStopwatchScreen(props: VideoStopwatchScreenProps) {
  const { view } = props;
  const { colors, space, radius, typography } = useTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const recordButton = view.recording ? (
    <Button size="timing" variant="stop" label={t('family_timing.video.stop_recording')} onPress={props.onStopRecording} />
  ) : view.savingVideo ? null : (
    <Button
      size="timing"
      variant="dark"
      label={t('family_timing.video.record')}
      onPress={props.onRecord}
      disabledReason={view.cameraReady ? undefined : t('family_timing.video.camera_starting')}
    />
  );

  const clockButtons =
    view.status === 'idle' ? (
      <Button
        size="timing"
        label={view.startWithTime && !view.recording ? t('family_timing.video.start_both') : t('family_timing.stopwatch.start')}
        onPress={props.onStart}
        disabledReason={view.canStart ? undefined : t('family_timing.video.record_first')}
      />
    ) : view.status === 'running' ? (
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        {view.hasLaps && (
          <View style={{ flex: 1 }}>
            <Button size="timing" variant="secondary" label={t('family_timing.stopwatch.split')} onPress={props.onSplit} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button size="timing" variant="stop" label={t('family_timing.stopwatch.stop')} onPress={props.onStop} />
        </View>
      </View>
    ) : view.savingVideo ? null : (
      <View style={{ gap: space[3] }}>
        <Button label={t('family_timing.stopwatch.save')} onPress={props.onSave} disabledReason={view.noTime ? t('family_timing.stopwatch.no_time') : undefined} />
        <Button variant="ghost" label={t('family_timing.stopwatch.discard')} onPress={props.onDiscard} />
      </View>
    );

  const panel = (
    <ScrollView contentContainerStyle={{ gap: space[3], padding: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <IconButton icon="arrow_back" label={t('family_timing.video.back')} onPress={props.onBack} />
        <Text style={[typography.caption, { color: colors['ink-muted'], flex: 1 }]} numberOfLines={2}>
          {view.event}
        </Text>
        {view.recordingTime && <Tag variant="warn" label={t('family_timing.video.recording', { time: view.recordingTime })} />}
      </View>
      <View style={{ alignItems: 'center', gap: space[1], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.header }}>
        <Text
          accessibilityLiveRegion={view.status === 'running' ? 'none' : 'polite'}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[typography['time-display'], { color: colors['on-header'] }]}
        >
          {view.time}
        </Text>
        {view.buttonsHint && <Text style={[typography.caption, { color: colors['on-header-muted'], textAlign: 'center' }]}>{view.buttonsHint}</Text>}
      </View>
      {view.phase === 'ready' && view.status === 'idle' && !view.recording && <Banner variant="info">{t('family_timing.video.calls_hint')}</Banner>}
      {view.lowSpace && <Banner variant="warn">{t('family_timing.video.low_space')}</Banner>}
      {view.noTime && <Banner variant="warn">{t('family_timing.stopwatch.no_time')}</Banner>}
      {view.saveError && (
        <Banner variant="warn" icon="error">
          {t('family_timing.save_error')}
        </Banner>
      )}
      {view.savingVideo && <Banner variant="info">{t('family_timing.video.saving_video')}</Banner>}
      {view.lapProgress && <Text style={[typography['body-strong'], { color: colors.ink, textAlign: 'center' }]}>{view.lapProgress}</Text>}
      {view.phase === 'ready' && (
        <>
          {recordButton}
          {clockButtons}
        </>
      )}
      {view.laps.map((row, index) => (
        <Text key={index} style={[typography['time-sm'], { color: colors.ink }]}>
          {t('family_timing.stopwatch.split_row', { number: index + 1, time: row.lap, total: row.total })}
        </Text>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, flexDirection: landscape ? 'row' : 'column', backgroundColor: colors['surface-0'] }}>
      <View
        accessibilityLabel={t('family_timing.video.camera')}
        style={{ flex: landscape ? 3 : 1, overflow: 'hidden', backgroundColor: colors.header, borderRadius: radius.lg, margin: space[2] }}
      >
        {view.phase === 'asking' ? (
          <Text style={[typography.body, { color: colors['on-header'], margin: space[4] }]}>{t('family_timing.video.asking')}</Text>
        ) : (
          props.preview
        )}
      </View>
      <View style={landscape ? { flex: 2 } : { maxHeight: '55%' }}>{panel}</View>
    </SafeAreaView>
  );
}
