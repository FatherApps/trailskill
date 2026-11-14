import { useGoBack } from '../../core/navigation';
import { SettingsContainer } from '../../modules/settings';

// "/settings": "Ajustes", the device preferences (theme and time precision).
export default function SettingsRoute() {
  const goBack = useGoBack('/');
  return <SettingsContainer onBack={goBack} />;
}
