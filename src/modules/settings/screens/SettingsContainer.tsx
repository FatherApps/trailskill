import { usePreferences } from '../../../core/preferences';
import { SettingsScreen } from './SettingsScreen';

// Reads and saves the device preferences; every change applies at once.
export function SettingsContainer({ onBack }: { onBack: () => void }) {
  const { preferences, update } = usePreferences();
  return (
    <SettingsScreen
      themeMode={preferences.themeMode}
      timePrecision={preferences.timePrecision}
      onThemeModeChange={(themeMode) => update({ themeMode })}
      onTimePrecisionChange={(timePrecision) => update({ timePrecision })}
      onBack={onBack}
    />
  );
}
