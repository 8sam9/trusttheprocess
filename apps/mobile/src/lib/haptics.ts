import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin wrapper around expo-haptics: a no-op on web, and failures (devices without a haptic engine,
 * the system setting turned off) are swallowed because haptics are never essential.
 */
function run(fn: () => Promise<void> | void): void {
  if (Platform.OS === 'web') return;
  try {
    Promise.resolve(fn()).catch(() => {});
  } catch {
    // no haptic engine
  }
}

export const haptics = {
  /** Radio card, chip or stepper change. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** Hitting a limit, such as the calorie floor. */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A save or apply succeeded. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
