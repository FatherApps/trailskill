import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { themeModes, type ThemeMode } from '../../../core/preferences';
import { useTheme } from '../../../core/theme';
import { Button, Icon, Segmented, type IconName } from '../../../core/ui';
import { SettingsFrame } from '../components/SettingsFrame';
import { SettingsSection } from '../components/SettingsSection';
import '../i18n';

export type SettingsScreenProps = {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  /** Opens "Cronómetro avanzado"; the entry is not shown without it. */
  onOpenStopwatch?: () => void;
  onOpenVideo: () => void;
  /** Opens "Mi cuenta" (authorizations, sign out, delete the account); the entry is not shown without it. */
  onOpenAccount?: () => void;
  onBack: () => void;
};

function Entry({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Button variant="secondary" icon={<Icon name={icon} />} trailingIcon={<Icon name="chevron_right" />} label={label} onPress={onPress} />;
}

// "Ajustes": the theme, then the entries to the screens that hold the rest. Presentational: the caller reads and saves.
export function SettingsScreen({ themeMode, onThemeModeChange, onOpenStopwatch, onOpenVideo, onOpenAccount, onBack }: SettingsScreenProps) {
  const { space } = useTheme();
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
      <View style={{ gap: space[3] }}>
        {onOpenStopwatch && <Entry icon="timer" label={t('settings.stopwatch.title')} onPress={onOpenStopwatch} />}
        <Entry icon="videocam" label={t('settings.video.title')} onPress={onOpenVideo} />
        {onOpenAccount && <Entry icon="person" label={t('settings.account')} onPress={onOpenAccount} />}
      </View>
    </SettingsFrame>
  );
}
