import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { usePreferences } from '../../../core/preferences';
import { doNotDisturb, type DoNotDisturbPort } from '../../family-timing';
import { VideoSettingsScreen } from './VideoSettingsScreen';

// "Configuración de video": reads and saves the recording preferences; every change applies at once.
export function VideoSettingsContainer({ onBack, dnd = doNotDisturb }: { onBack: () => void; dnd?: DoNotDisturbPort }) {
  const { preferences, update } = usePreferences();
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
    <VideoSettingsScreen
      onBack={onBack}
      video={{
        settings: videoRecording,
        onChange: changeVideo,
        doNotDisturb: dnd.available ? { hasAccess: dndAccess, onOpenAccess: () => dnd.openAccessSettings() } : null,
      }}
    />
  );
}
