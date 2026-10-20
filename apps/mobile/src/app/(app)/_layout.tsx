import { fonts } from '@ttp/ui';
import { Stack } from 'expo-router';
import { useOnboardingGate } from '@/features/targets/gate';
import { PlanSavedProvider } from '@/features/targets/planSaved';
import { GateError, GateLoading } from '@/features/targets/screens/GateScreens';
import { useColors } from '@/lib/theme';

export const unstable_settings = { anchor: 'index' };

function AppStack() {
  const c = useColors();
  const status = useOnboardingGate();

  // Until we know whether onboarding is done, show neither Today nor onboarding (no flash of the wrong screen).
  if (status === 'checking') return <GateLoading />;
  if (status === 'error') return <GateError />;

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
      <Stack.Protected guard={status === 'complete'}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'PROFILE & SETTINGS' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needs_onboarding'}>
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function AppLayout() {
  return (
    <PlanSavedProvider>
      <AppStack />
    </PlanSavedProvider>
  );
}
