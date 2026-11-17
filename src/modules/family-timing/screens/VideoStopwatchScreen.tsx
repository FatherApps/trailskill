import type { ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Icon, IconButton } from '../../../core/ui';
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
  /** The camera's live image; it fills the whole screen. */
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

type MainAction = { kind: 'record' | 'stop'; label: string; onPress: () => void; disabledReason?: string };

/** The step's main action, on the big round button: Grabar → Iniciar → Detener → Parar video. */
function mainAction(view: VideoStopwatchView, props: VideoStopwatchScreenProps): MainAction | null {
  if (view.savingVideo) return view.recording ? { kind: 'stop', label: t('family_timing.video.stop_recording'), onPress: props.onStopRecording } : null;
  if (view.status === 'idle') {
    if (!view.recording && view.startWithTime) {
      return {
        kind: 'record',
        label: t('family_timing.video.start_both'),
        onPress: props.onStart,
        disabledReason: view.canStart ? undefined : t('family_timing.video.camera_starting'),
      };
    }
    if (!view.recording) {
      return {
        kind: 'record',
        label: t('family_timing.video.record'),
        onPress: props.onRecord,
        disabledReason: view.cameraReady ? undefined : t('family_timing.video.camera_starting'),
      };
    }
    return { kind: 'record', label: t('family_timing.stopwatch.start'), onPress: props.onStart };
  }
  if (view.status === 'running') return { kind: 'stop', label: t('family_timing.stopwatch.stop'), onPress: props.onStop };
  return view.recording ? { kind: 'stop', label: t('family_timing.video.stop_recording'), onPress: props.onStopRecording } : null;
}

// The big round button: a coral ring with a dot (record or start) or a square (stop), its name under it.
function RoundButton({ action }: { action: MainAction }) {
  const { colors, space, radius, size, typography } = useTheme();
  const unavailable = action.disabledReason !== undefined;
  const ring = unavailable ? colors['border-strong'] : colors.coral;
  const label = unavailable ? `${action.label} · ${action.disabledReason}` : action.label;
  const inner = size['target-timing'] - space[6];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable}
      onPress={action.onPress}
      style={({ pressed }) => ({ alignItems: 'center', gap: space[1], opacity: pressed ? 0.8 : 1 })}
    >
      <View
        style={{
          width: size['target-timing'],
          height: size['target-timing'],
          borderRadius: radius.full,
          borderWidth: space[1],
          borderColor: ring,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.scrim,
        }}
      >
        {unavailable ? (
          <Icon name="lock" color="on-header" />
        ) : action.kind === 'record' ? (
          <View style={{ width: inner, height: inner, borderRadius: radius.full, backgroundColor: ring }} />
        ) : (
          <View style={{ width: inner / 2, height: inner / 2, borderRadius: space[1], backgroundColor: ring }} />
        )}
      </View>
      <Text style={[typography['body-strong'], { color: colors['on-header'], textAlign: 'center' }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// Presentational. The camera fills the whole screen and the stopwatch sits on top of the image, on small scrim panels so
// it reads over any scene: in portrait the time at the top and the controls at the bottom; in landscape the time at the
// top-left and the controls in a column on the right.
export function VideoStopwatchScreen(props: VideoStopwatchScreenProps) {
  const { view } = props;
  const { colors, space, radius, size, typography } = useTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const onImage = colors['on-header'];
  const panel: ViewStyle = { backgroundColor: colors.scrim, borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[1] };

  const main = view.phase === 'ready' ? mainAction(view, props) : null;

  const stopVideo = view.recording ? (
    <Button variant="secondary" label={t('family_timing.video.stop_recording')} onPress={props.onStopRecording} />
  ) : null;

  // Beside the round button: Parcial while the clock runs, Parar video before it starts, Descartar and Guardar at the end.
  const side =
    view.phase !== 'ready' || view.savingVideo
      ? null
      : view.status === 'running'
        ? view.hasLaps
          ? { left: <Button variant="secondary" label={t('family_timing.video.split')} onPress={props.onSplit} />, right: stopVideo }
          : { left: null, right: stopVideo }
        : view.status === 'idle'
          ? view.recording
            ? { left: stopVideo, right: null }
            : null
          : {
              left: <Button variant="secondary" label={t('family_timing.stopwatch.discard')} onPress={props.onDiscard} />,
              right: (
                <Button
                  label={t('family_timing.stopwatch.save')}
                  onPress={props.onSave}
                  disabledReason={view.noTime ? t('family_timing.stopwatch.no_time') : undefined}
                />
              ),
            };

  const caption =
    view.lapProgress ??
    (view.status === 'running'
      ? t('family_timing.video.time_running')
      : view.status === 'stopped'
        ? t('family_timing.video.time_final')
        : t('family_timing.video.time_ready'));

  const time = (
    <View style={{ alignItems: landscape ? 'flex-start' : 'center' }}>
      <View style={[panel, { alignItems: landscape ? 'flex-start' : 'center' }]}>
        <Text
          accessibilityLiveRegion={view.status === 'running' ? 'none' : 'polite'}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[typography['time-display'], { color: onImage }]}
        >
          {view.time}
        </Text>
        <Text style={[typography.body, { color: onImage }]}>{caption}</Text>
      </View>
    </View>
  );

  const banners = (
    <View style={{ gap: space[2] }}>
      {view.phase === 'asking' && <Banner variant="info">{t('family_timing.video.asking')}</Banner>}
      {view.phase === 'ready' && view.status === 'idle' && !view.recording && <Banner variant="info">{t('family_timing.video.calls_hint')}</Banner>}
      {view.lowSpace && <Banner variant="warn">{t('family_timing.video.low_space')}</Banner>}
      {view.noTime && <Banner variant="warn">{t('family_timing.stopwatch.no_time')}</Banner>}
      {view.saveError && (
        <Banner variant="warn" icon="error">
          {t('family_timing.save_error')}
        </Banner>
      )}
      {view.savingVideo && <Banner variant="info">{t('family_timing.video.saving_video')}</Banner>}
    </View>
  );

  const splits =
    view.laps.length > 0 || (view.hasLaps && view.status === 'running') ? (
      <View style={[panel, { alignSelf: 'flex-start', gap: space[1] }]}>
        {view.laps.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: space[3] }}>
            <Text style={[typography.body, { color: onImage }]}>{t('family_timing.video.split_row', { number: index + 1 })}</Text>
            <Text style={[typography['time-sm'], { color: onImage }]}>{row.lap}</Text>
          </View>
        ))}
        {view.status === 'running' && view.hasLaps && (
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <Text style={[typography.body, { color: onImage }]}>{t('family_timing.video.split_row', { number: view.laps.length + 1 })}</Text>
            <Text style={[typography.body, { color: onImage, fontStyle: 'italic' }]}>{t('family_timing.video.in_progress')}</Text>
          </View>
        )}
      </View>
    ) : null;

  const hint = view.buttonsHint ? (
    <Text style={[typography.caption, panel, { color: onImage, textAlign: 'center', alignSelf: 'center' }]}>{view.buttonsHint}</Text>
  ) : null;

  const topBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <IconButton icon="arrow_back" label={t('family_timing.video.back')} onPress={props.onBack} />
      {landscape ? (
        <Text style={[typography['body-strong'], panel, { color: onImage, flexShrink: 1 }]} numberOfLines={1}>
          {view.event}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      {view.recordingTime && (
        <View style={[panel, { flexDirection: 'row', alignItems: 'center', gap: space[2] }]}>
          <View style={{ width: space[3], height: space[3], borderRadius: radius.full, backgroundColor: colors.coral }} />
          <Text style={[typography['body-strong'], { color: onImage }]}>{t('family_timing.video.recording', { time: view.recordingTime })}</Text>
        </View>
      )}
    </View>
  );

  const slot = (node: ReactNode) => <View style={landscape ? undefined : { flex: 1 }}>{node}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.header }}>
      <View accessibilityLabel={t('family_timing.video.camera')} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
        {props.preview}
      </View>
      <SafeAreaView style={{ flex: 1, padding: space[4], flexDirection: landscape ? 'row' : 'column', gap: space[4] }}>
        {landscape ? (
          <>
            <View style={{ flex: 1, gap: space[3] }}>
              {topBar}
              {time}
              {banners}
              <View style={{ flex: 1 }} />
              {splits}
              {hint}
            </View>
            <View style={{ justifyContent: 'center', alignItems: 'center', gap: space[4] }}>
              {side?.left && slot(side.left)}
              {main && <RoundButton action={main} />}
              {side?.right && slot(side.right)}
            </View>
          </>
        ) : (
          <>
            {topBar}
            <Text style={[typography['body-strong'], panel, { color: onImage, textAlign: 'center', alignSelf: 'center' }]} numberOfLines={2}>
              {view.event}
            </Text>
            {time}
            {banners}
            <View style={{ flex: 1 }} />
            {splits}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              {slot(side?.left ?? null)}
              {main ? <RoundButton action={main} /> : <View style={{ width: size['target-timing'] }} />}
              {slot(side?.right ?? null)}
            </View>
            {hint}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
