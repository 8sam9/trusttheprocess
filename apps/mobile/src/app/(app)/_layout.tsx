import { Stack } from 'expo-router';
import { useColors } from '@/lib/theme';

export default function AppLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Today' }} />
      <Stack.Screen name="settings" options={{ title: 'Profile & settings' }} />
    </Stack>
  );
}
