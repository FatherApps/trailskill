import { useRouter } from 'expo-router';

import { useGoBack } from '../../core/navigation';
import { SettingsContainer } from '../../modules/settings';

// "/settings": "Ajustes", the device preferences (theme and time precision), and the way to "Mi cuenta".
export default function SettingsRoute() {
  const goBack = useGoBack('/');
  const router = useRouter();
  return <SettingsContainer onBack={goBack} onOpenAccount={() => router.push('/account')} />;
}
