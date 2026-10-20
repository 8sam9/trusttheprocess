import { space } from '@ttp/ui';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/lib/theme';

/** Content column: full width on phones, a centred 480 px column on wide web screens. */
export const columnStyle = { width: '100%', maxWidth: 480, alignSelf: 'center' } as const;

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  const content = <View style={[columnStyle, { padding: space.lg, gap: space.md }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
