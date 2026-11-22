import { useGoBack } from '../../../core/navigation';
import { StopwatchSettingsContainer } from '../../../modules/settings';

// "/settings/stopwatch": "Cronómetro avanzado", the headset or volume keys.
export default function StopwatchSettingsRoute() {
  const goBack = useGoBack('/settings');
  return <StopwatchSettingsContainer onBack={goBack} />;
}
