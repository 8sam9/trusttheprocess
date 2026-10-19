import { fonts } from '@ttp/ui';
import { Stack } from 'expo-router';
import { useColors } from '@/lib/theme';

export default function AppLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.title, fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'PROFILE & SETTINGS' }} />
    </Stack>
  );
}
