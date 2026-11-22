import { useGoBack } from '../../../core/navigation';
import { VideoSettingsContainer } from '../../../modules/settings';

// "/settings/video": "Configuración de video", how the individual stopwatch records.
export default function VideoSettingsRoute() {
  const goBack = useGoBack('/settings');
  return <VideoSettingsContainer onBack={goBack} />;
}
