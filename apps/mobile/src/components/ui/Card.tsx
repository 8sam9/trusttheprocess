import { radius, space } from '@ttp/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useColors } from '@/lib/theme';

export function Card({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      {children}
    </View>
  );
}
