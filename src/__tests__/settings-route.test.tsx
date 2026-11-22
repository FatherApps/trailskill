import { fireEvent, render, screen } from '@testing-library/react-native';

import SettingsRoute from '../app/(app)/settings';
import StopwatchSettingsRoute from '../app/(app)/settings/stopwatch';
import VideoSettingsRoute from '../app/(app)/settings/video';

const mockGoBack = jest.fn();
const mockFallbacks: string[] = [];
jest.mock('../core/navigation', () => ({
  useGoBack: (fallback: string) => {
    mockFallbacks.push(fallback);
    return mockGoBack;
  },
}));
jest.mock('../modules/settings', () => {
  // The screens themselves are tested in the settings module; here only what the routes hand them.
  const { Pressable, Text, View } = jest.requireActual('react-native');
  const entry = (label: string, onPress?: () => void) =>
    onPress && (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  return {
    SettingsContainer: (props: { onBack: () => void; onOpenStopwatch: () => void; onOpenVideo: () => void; onOpenAccount?: () => void }) => (
      <View>
        {entry('Volver', props.onBack)}
        {entry('Cronómetro avanzado', props.onOpenStopwatch)}
        {entry('Configuración de video', props.onOpenVideo)}
        {entry('Mi cuenta', props.onOpenAccount)}
      </View>
    ),
    StopwatchSettingsContainer: (props: { onBack: () => void }) => entry('Volver', props.onBack),
    VideoSettingsContainer: (props: { onBack: () => void }) => entry('Volver', props.onBack),
  };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockClear();
  mockGoBack.mockClear();
  mockFallbacks.length = 0;
});

describe('Settings routes', () => {
  it.each([
    ['Cronómetro avanzado', '/settings/stopwatch'],
    ['Configuración de video', '/settings/video'],
    ['Mi cuenta', '/account'],
  ])('"Ajustes" opens %s', async (label, href) => {
    await render(<SettingsRoute />);

    await fireEvent.press(screen.getByRole('button', { name: label }));

    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it.each([
    ['Cronómetro avanzado', StopwatchSettingsRoute],
    ['Configuración de video', VideoSettingsRoute],
  ])('%s goes back to "Ajustes"', async (_label, Route) => {
    await render(<Route />);

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockFallbacks).toContain('/settings');
  });
});
