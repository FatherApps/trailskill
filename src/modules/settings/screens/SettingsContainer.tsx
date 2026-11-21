import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { usePreferences } from '../../../core/preferences';
import { doNotDisturb, type DoNotDisturbPort } from '../../family-timing';
import { keyName, timingButton, useExternalKeyboards, useLearnKey, type TimingButtonPort } from '../../timing';
import { SettingsScreen, type ButtonKey } from './SettingsScreen';

// Reads and saves the device preferences; every change applies at once.
export function SettingsContainer({
  onBack,
  onOpenAccount,
  buttons = timingButton,
  dnd = doNotDisturb,
}: {
  onBack: () => void;
  onOpenAccount?: () => void;
  buttons?: TimingButtonPort;
  dnd?: DoNotDisturbPort;
}) {
  const { preferences, update } = usePreferences();
  const timingButtons = preferences.timingButtons;
  const keyboards = useExternalKeyboards(buttons);
  const learner = useLearnKey(buttons);
  const [learningKey, setLearningKey] = useState<ButtonKey | null>(null);
  const changeButtons = (changes: Partial<typeof timingButtons>) => update({ timingButtons: { ...timingButtons, ...changes } });
  const videoRecording = preferences.videoRecording;
  // The access to "No molestar" is given in Android's settings: read again each time the person comes back to the app.
  const [dndAccess, setDndAccess] = useState(() => dnd.hasAccess());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDndAccess(dnd.hasAccess());
    });
    return () => subscription.remove();
  }, [dnd]);
  const changeVideo = (changes: Partial<typeof videoRecording>) => {
    update({ videoRecording: { ...videoRecording, ...changes } });
    // Turning the option on without access takes the person to the screen where Android gives it.
    if (changes.doNotDisturb && !dnd.hasAccess()) dnd.openAccessSettings();
  };

  return (
    <SettingsScreen
      themeMode={preferences.themeMode}
      timePrecision={preferences.timePrecision}
      onThemeModeChange={(themeMode) => update({ themeMode })}
      onTimePrecisionChange={(timePrecision) => update({ timePrecision })}
      onOpenAccount={onOpenAccount}
      onBack={() => {
        learner.cancel();
        onBack();
      }}
      video={{
        settings: videoRecording,
        onChange: changeVideo,
        doNotDisturb: dnd.available ? { hasAccess: dndAccess, onOpenAccess: () => dnd.openAccessSettings() } : null,
      }}
      buttons={
        buttons.available
          ? {
              settings: timingButtons,
              startKeyName: keyName(timingButtons.startKey),
              splitKeyName: keyName(timingButtons.splitKey),
              keyboards: keyboards.map((k) => k.name),
              learning: learner.learning ? learningKey : null,
              onChange: changeButtons,
              onLearn: (key) => {
                setLearningKey(key);
                learner.learn((keyCode) => changeButtons(key === 'start' ? { startKey: keyCode } : { splitKey: keyCode }));
              },
              onCancelLearn: () => {
                learner.cancel();
                setLearningKey(null);
              },
            }
          : null
      }
    />
  );
}
