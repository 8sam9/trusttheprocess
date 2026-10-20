import { motion } from '@ttp/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform } from 'react-native';
import { useReduceMotion } from '@/lib/a11y';

/** Fade and rise 8 pt over 200 ms, optionally delayed (the reveal's staggered cards). Instant with Reduce Motion. */
export function FadeRise({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
      delay: index * motion.stagger,
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [reduce, index, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
