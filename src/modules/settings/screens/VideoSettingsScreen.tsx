import { t } from '../../../core/i18n';
import { videoStopAfterSeconds, type VideoRecordingPreferences } from '../../../core/preferences';
import { Banner, Button, Segmented } from '../../../core/ui';
import { SettingsFrame } from '../components/SettingsFrame';
import { SettingsSection } from '../components/SettingsSection';
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

// "Configuración de video": how the individual stopwatch records. The quality stays on "Ajustes". Presentational.
export function VideoSettingsScreen({ video: view, onBack }: VideoSettingsScreenProps) {
  const { settings } = view;
  const onOff = [
    { value: 'on', label: t('settings.video.on') },
    { value: 'off', label: t('settings.video.off') },
  ];
  return (
    <SettingsFrame title={t('settings.video.title')} intro={t('settings.video.intro')} onBack={onBack}>
      <SettingsSection label={t('settings.video.audio_label')} hint={t('settings.video.audio_hint')}>
        <Segmented
          accessibilityLabel={t('settings.video.audio_label')}
          value={settings.audio ? 'on' : 'off'}
          onChange={(value) => view.onChange({ audio: value === 'on' })}
          options={onOff}
        />
      </SettingsSection>
      <SettingsSection label={t('settings.video.show_stopwatch_label')} hint={t('settings.video.show_stopwatch_hint')}>
        <Segmented
          accessibilityLabel={t('settings.video.show_stopwatch_label')}
          value={settings.showStopwatch ? 'on' : 'off'}
          onChange={(value) => view.onChange({ showStopwatch: value === 'on' })}
          options={onOff}
        />
      </SettingsSection>
      <SettingsSection label={t('settings.video.start_with_time_label')} hint={t('settings.video.start_with_time_hint')}>
        <Segmented
          accessibilityLabel={t('settings.video.start_with_time_label')}
          value={settings.startWithTime ? 'on' : 'off'}
          onChange={(value) => view.onChange({ startWithTime: value === 'on' })}
          options={onOff}
        />
      </SettingsSection>
      {view.doNotDisturb && (
        <SettingsSection label={t('settings.video.dnd_label')} hint={t('settings.video.dnd_hint')}>
          <Segmented
            accessibilityLabel={t('settings.video.dnd_label')}
            value={settings.doNotDisturb ? 'on' : 'off'}
            onChange={(value) => view.onChange({ doNotDisturb: value === 'on' })}
            options={onOff}
          />
          {settings.doNotDisturb && !view.doNotDisturb.hasAccess && (
            <>
              <Banner variant="warn" icon="lock">
                {t('settings.video.dnd_no_access')}
              </Banner>
              <Button variant="secondary" label={t('settings.video.dnd_open')} onPress={view.doNotDisturb.onOpenAccess} />
            </>
          )}
        </SettingsSection>
      )}
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
