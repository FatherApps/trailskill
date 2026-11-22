import { useRouter } from 'expo-router';

import { useGoBack } from '../../../core/navigation';
import { SettingsContainer } from '../../../modules/settings';

// "/settings": "Ajustes", the everyday device preferences and the entries to "Cronómetro avanzado", "Configuración de video" and "Mi cuenta",
// which holds "Autorizaciones", "Cerrar sesión" and "Eliminar mis datos".
export default function SettingsRoute() {
  const goBack = useGoBack('/');
  const router = useRouter();
  return (
    <SettingsContainer
      onBack={goBack}
      onOpenStopwatch={() => router.push('/settings/stopwatch')}
      onOpenVideo={() => router.push('/settings/video')}
      onOpenAccount={() => router.push('/account')}
    />
  );
}
