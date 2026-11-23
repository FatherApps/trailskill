import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { videoQualities, videoStopAfterSeconds, type VideoRecordingPreferences } from '../../../core/preferences';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Segmented } from '../../../core/ui';
import { SettingsFrame } from '../components/SettingsFrame';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsSwitchRow } from '../components/SettingsSwitchRow';
import '../i18n';

export type SettingsVideoView = {
  settings: VideoRecordingPreferences;
  onChange: (changes: Partial<VideoRecordingPreferences>) => void;
  /** "No molestar" while recording (#1090); null where the phone cannot change it (iOS, or a build without the module). */
  doNotDisturb?: { hasAccess: boolean; onOpenAccess: () => void } | null;
};

export type VideoSettingsScreenProps = {
  video: SettingsVideoView;
  onBack: () => void;
};

// "Configuración de video": how the individual stopwatch records, its quality first. Presentational.
export function VideoSettingsScreen({ video: view, onBack }: VideoSettingsScreenProps) {
  const { space } = useTheme();
  const { settings } = view;
  return (
    <SettingsFrame title={t('settings.video.title')} intro={t('settings.video.intro')} onBack={onBack}>
      <SettingsSection label={t('settings.video.quality_label')} hint={t('settings.video.quality_hint')}>
        <Segmented
          accessibilityLabel={t('settings.video.quality_label')}
          value={settings.quality}
          onChange={(quality) => view.onChange({ quality })}
          options={videoQualities.map((quality) => ({ value: quality, label: t(`settings.video.quality.${quality}`) }))}
        />
      </SettingsSection>
      <View style={{ gap: space[2] }}>
        <SettingsSwitchRow
          icon="videocam"
          label={t('settings.video.audio_label')}
          hint={t('settings.video.audio_hint')}
          value={settings.audio}
          onChange={(audio) => view.onChange({ audio })}
        />
        <SettingsSwitchRow
          icon="timer"
          label={t('settings.video.show_stopwatch_label')}
          hint={t('settings.video.show_stopwatch_hint')}
          value={settings.showStopwatch}
          onChange={(showStopwatch) => view.onChange({ showStopwatch })}
        />
        <SettingsSwitchRow
          icon="play_arrow"
          label={t('settings.video.start_with_time_label')}
          hint={t('settings.video.start_with_time_hint')}
          value={settings.startWithTime}
          onChange={(startWithTime) => view.onChange({ startWithTime })}
        />
        {view.doNotDisturb && (
          <>
            <SettingsSwitchRow
              icon="notifications"
              label={t('settings.video.dnd_label')}
              hint={t('settings.video.dnd_hint')}
              value={settings.doNotDisturb}
              onChange={(doNotDisturb) => view.onChange({ doNotDisturb })}
            />
            {settings.doNotDisturb && !view.doNotDisturb.hasAccess && (
              <>
                <Banner variant="warn" icon="lock">
                  {t('settings.video.dnd_no_access')}
                </Banner>
                <Button variant="secondary" label={t('settings.video.dnd_open')} onPress={view.doNotDisturb.onOpenAccess} />
              </>
            )}
          </>
        )}
      </View>
      <SettingsSection label={t('settings.video.stop_after_label')} hint={t('settings.video.stop_after_hint')}>
        <Segmented
          accessibilityLabel={t('settings.video.stop_after_label')}
          value={String(settings.stopAfterSeconds)}
          onChange={(value) => view.onChange({ stopAfterSeconds: Number(value) })}
          options={videoStopAfterSeconds.map((seconds) => ({ value: String(seconds), label: t('settings.video.seconds', { count: seconds }) }))}
        />
      </SettingsSection>
    </SettingsFrame>
  );
}
