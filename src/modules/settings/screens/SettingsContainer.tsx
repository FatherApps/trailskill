import { usePreferences } from '../../../core/preferences';
import { timingButton, type TimingButtonPort } from '../../timing';
import { SettingsScreen } from './SettingsScreen';

// "Ajustes": reads and saves the device preferences shown on it; every change applies at once.
export function SettingsContainer({
  onBack,
  onOpenStopwatch,
  onOpenVideo,
  onOpenAccount,
  buttons = timingButton,
}: {
  onBack: () => void;
  onOpenStopwatch: () => void;
  onOpenVideo: () => void;
  onOpenAccount?: () => void;
  buttons?: TimingButtonPort;
}) {
  const { preferences, update } = usePreferences();
  const { timingButtons, videoRecording } = preferences;
  return (
    <SettingsScreen
      themeMode={preferences.themeMode}
      timePrecision={preferences.timePrecision}
      onThemeModeChange={(themeMode) => update({ themeMode })}
      onTimePrecisionChange={(timePrecision) => update({ timePrecision })}
      // The vibration belongs to the buttons: it shows where they are used, as it did beside them.
      vibrate={
        buttons.available && timingButtons.enabled
          ? { value: timingButtons.vibrate, onChange: (vibrate) => update({ timingButtons: { ...timingButtons, vibrate } }) }
          : null
      }
      videoQuality={videoRecording.quality}
      onVideoQualityChange={(quality) => update({ videoRecording: { ...videoRecording, quality } })}
      onOpenStopwatch={onOpenStopwatch}
      onOpenVideo={onOpenVideo}
      onOpenAccount={onOpenAccount}
      onBack={onBack}
    />
  );
}
