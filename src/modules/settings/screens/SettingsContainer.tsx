import { usePreferences } from '../../../core/preferences';
import { SettingsScreen } from './SettingsScreen';

// "Ajustes": reads and saves the theme; every change applies at once.
export function SettingsContainer({
  onBack,
  onOpenStopwatch,
  onOpenVideo,
  onOpenAccount,
}: {
  onBack: () => void;
  onOpenStopwatch: () => void;
  onOpenVideo: () => void;
  onOpenAccount?: () => void;
}) {
  const { preferences, update } = usePreferences();
  return (
    <SettingsScreen
      themeMode={preferences.themeMode}
      onThemeModeChange={(themeMode) => update({ themeMode })}
      onOpenStopwatch={onOpenStopwatch}
      onOpenVideo={onOpenVideo}
      onOpenAccount={onOpenAccount}
      onBack={onBack}
    />
  );
}
