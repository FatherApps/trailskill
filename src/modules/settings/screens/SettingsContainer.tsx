import { useState } from 'react';

import { usePreferences } from '../../../core/preferences';
import { keyName, timingButton, useExternalKeyboards, useLearnKey, type TimingButtonPort } from '../../timing';
import { SettingsScreen, type ButtonKey } from './SettingsScreen';

// Reads and saves the device preferences; every change applies at once.
export function SettingsContainer({ onBack, buttons = timingButton }: { onBack: () => void; buttons?: TimingButtonPort }) {
  const { preferences, update } = usePreferences();
  const timingButtons = preferences.timingButtons;
  const keyboards = useExternalKeyboards(buttons);
  const learner = useLearnKey(buttons);
  const [learningKey, setLearningKey] = useState<ButtonKey | null>(null);
  const changeButtons = (changes: Partial<typeof timingButtons>) => update({ timingButtons: { ...timingButtons, ...changes } });

  return (
    <SettingsScreen
      themeMode={preferences.themeMode}
      timePrecision={preferences.timePrecision}
      onThemeModeChange={(themeMode) => update({ themeMode })}
      onTimePrecisionChange={(timePrecision) => update({ timePrecision })}
      onBack={() => {
        learner.cancel();
        onBack();
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
