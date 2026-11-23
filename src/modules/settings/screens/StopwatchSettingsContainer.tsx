import { useEffect, useRef, useState } from 'react';

import { usePreferences } from '../../../core/preferences';
import { keyName, timingButton, useExternalKeyboards, useLearnKey, type TimingButtonPort } from '../../timing';
import { StopwatchSettingsScreen, type ButtonKey } from './StopwatchSettingsScreen';

// "Cronómetro avanzado": reads and saves the button preferences; every change applies at once.
export function StopwatchSettingsContainer({ onBack, buttons = timingButton }: { onBack: () => void; buttons?: TimingButtonPort }) {
  const { preferences, update } = usePreferences();
  const timingButtons = preferences.timingButtons;
  const keyboards = useExternalKeyboards(buttons);
  const learner = useLearnKey(buttons);
  const { cancel } = learner;
  const [learningKey, setLearningKey] = useState<ButtonKey | null>(null);
  const changeButtons = (changes: Partial<typeof timingButtons>) => update({ timingButtons: { ...timingButtons, ...changes } });
  // This screen can close with Android's back too: the keys never stay waiting for a press once it is gone.
  const learningNow = useRef(false);
  useEffect(() => {
    learningNow.current = learner.learning;
  }, [learner.learning]);
  useEffect(
    () => () => {
      if (learningNow.current) cancel();
    },
    [cancel],
  );

  return (
    <StopwatchSettingsScreen
      freeLaps={{ value: preferences.freeLaps, onChange: (freeLaps) => update({ freeLaps }) }}
      onBack={() => {
        cancel();
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
                cancel();
                setLearningKey(null);
              },
            }
          : null
      }
    />
  );
}
