import { Stack } from 'expo-router';
import { useProfile } from '@/features/profile/api';
import { OnboardingProvider, useOnboarding } from '@/features/targets/OnboardingProvider';
import { GateLoading } from '@/features/targets/screens/GateScreens';
import { useColors } from '@/lib/theme';

function OnboardingStack() {
  const { phase } = useOnboarding();
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Protected guard={phase === 'consent'}>
        <Stack.Screen name="consent" options={{ headerShown: false }} />
        <Stack.Screen name="declined" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'underage'}>
        <Stack.Screen name="not-yet" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'steps'}>
        <Stack.Screen name="about-you" options={{ headerShown: false }} />
        <Stack.Screen name="goal" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="pace" />
        <Stack.Screen name="plan" />
      </Stack.Protected>
    </Stack>
  );
}

/** The onboarding group: one route per step so swipe-back, Android back and browser back all work. */
export default function OnboardingLayout() {
  const profile = useProfile().data;
  if (!profile) return <GateLoading />;
  return (
    <OnboardingProvider profile={profile}>
      <OnboardingStack />
    </OnboardingProvider>
  );
}
