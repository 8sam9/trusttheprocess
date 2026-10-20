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
        // Every step draws its own header (StepHeader with its Back button), so there is only one.
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Protected guard={phase === 'consent'}>
        <Stack.Screen name="consent" />
        <Stack.Screen name="declined" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'underage'}>
        <Stack.Screen name="not-yet" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'steps'}>
        <Stack.Screen name="about-you" />
        <Stack.Screen name="goal" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="pace" />
        <Stack.Screen name="plan" />
      </Stack.Protected>
    </Stack>
  );
}

/** The onboarding group: one route per step so swipe-back, Android back and browser back all work. */
// The first step is the group's anchor, so leaving the consent step lands on it directly.
export const unstable_settings = { anchor: 'about-you' };

export default function OnboardingLayout() {
  const profile = useProfile().data;
  if (!profile) return <GateLoading />;
  return (
    <OnboardingProvider profile={profile}>
      <OnboardingStack />
    </OnboardingProvider>
  );
}
