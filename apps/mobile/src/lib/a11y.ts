import { largeTextScale } from '@ttp/ui';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, useWindowDimensions } from 'react-native';

/** True at Dynamic Type / font scale >= 1.5 (D5): layouts reflow, footers unpin, the tagline hides. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= largeTextScale;
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Screen-reader announcement. Android and web use live regions on the element; iOS needs this call. */
export function announce(message: string): void {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
}

/** True when the viewport is wide enough for dialogs instead of bottom sheets (web at >= 768 px). */
export function useWideWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 768;
}
