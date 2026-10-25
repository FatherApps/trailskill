import * as Haptics from 'expo-haptics';

// Runs the action first, so nothing waits for the motor, then gives a light tap. A phone without one stays silent.
export const withTap = (action: () => void) => () => {
  action();
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
