import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { themeModes, timePrecisions, videoQualities, type ThemeMode, type TimePrecision, type VideoQuality } from '../../../core/preferences';
import { useTheme } from '../../../core/theme';
import { formatMillis } from '../../../core/time';
import { Button, Icon, Segmented, type IconName } from '../../../core/ui';
import { SettingsFrame } from '../components/SettingsFrame';
import { SettingsSection } from '../components/SettingsSection';
import '../i18n';

export type SettingsScreenProps = {
  themeMode: ThemeMode;
  timePrecision: TimePrecision;
  onThemeModeChange: (mode: ThemeMode) => void;
  onTimePrecisionChange: (precision: TimePrecision) => void;
  /** Vibrating when a button marks; null where the buttons are not used (the phone cannot, or they are off). */
  vibrate: { value: boolean; onChange: (vibrate: boolean) => void } | null;
  videoQuality: VideoQuality;
  onVideoQualityChange: (quality: VideoQuality) => void;
  /** Opens "Cronómetro avanzado"; absent where the phone cannot use the buttons, and so is the entry. */
  onOpenStopwatch?: () => void;
  onOpenVideo: () => void;
  /** Opens "Mi cuenta" (authorizations, sign out, delete the account); the entry is not shown without it. */
  onOpenAccount?: () => void;
  onBack: () => void;
};

// A fixed synthetic time for the example under the precision choice.
const EXAMPLE_MILLIS = 65_372;

function Entry({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Button variant="secondary" icon={<Icon name={icon} />} trailingIcon={<Icon name="chevron_right" />} label={label} onPress={onPress} />;
}

// "Ajustes": the everyday choices first, then the entries to the screens that hold the rest. Presentational: the caller reads and saves.
export function SettingsScreen({
  themeMode,
  timePrecision,
  onThemeModeChange,
  onTimePrecisionChange,
  vibrate,
  videoQuality,
  onVideoQualityChange,
  onOpenStopwatch,
  onOpenVideo,
  onOpenAccount,
  onBack,
}: SettingsScreenProps) {
  const { colors, space, typography } = useTheme();
  return (
    <SettingsFrame title={t('settings.title')} onBack={onBack}>
      <SettingsSection label={t('settings.theme.label')} hint={t('settings.theme.hint')}>
        <Segmented
          accessibilityLabel={t('settings.theme.label')}
          value={themeMode}
          onChange={onThemeModeChange}
          options={themeModes.map((mode) => ({ value: mode, label: t(`settings.theme.${mode}`) }))}
        />
      </SettingsSection>
      <SettingsSection label={t('settings.precision.label')} hint={t('settings.precision.hint')}>
        <Segmented
          accessibilityLabel={t('settings.precision.label')}
          value={timePrecision}
          onChange={onTimePrecisionChange}
          options={timePrecisions.map((precision) => ({ value: precision, label: t(`settings.precision.${precision}`) }))}
        />
        <Text style={[typography['time-md'], { color: colors.ink }]}>
          {t('settings.precision.example', { time: formatMillis(EXAMPLE_MILLIS, { precision: timePrecision }) })}
        </Text>
      </SettingsSection>
      {vibrate && (
        <SettingsSection label={t('settings.buttons.vibrate_label')} hint={t('settings.buttons.vibrate_hint')}>
          <Segmented
            accessibilityLabel={t('settings.buttons.vibrate_label')}
            value={vibrate.value ? 'on' : 'off'}
            onChange={(value) => vibrate.onChange(value === 'on')}
            options={[
              { value: 'on', label: t('settings.buttons.on') },
              { value: 'off', label: t('settings.buttons.off') },
            ]}
          />
        </SettingsSection>
      )}
      <SettingsSection label={t('settings.video.quality_label')} hint={t('settings.video.quality_hint')}>
        <Segmented
          accessibilityLabel={t('settings.video.quality_label')}
          value={videoQuality}
          onChange={onVideoQualityChange}
          options={videoQualities.map((quality) => ({ value: quality, label: t(`settings.video.quality.${quality}`) }))}
        />
      </SettingsSection>
      <View style={{ gap: space[3] }}>
        {onOpenStopwatch && <Entry icon="timer" label={t('settings.stopwatch.title')} onPress={onOpenStopwatch} />}
        <Entry icon="videocam" label={t('settings.video.title')} onPress={onOpenVideo} />
        {onOpenAccount && <Entry icon="person" label={t('settings.account')} onPress={onOpenAccount} />}
      </View>
    </SettingsFrame>
  );
}
