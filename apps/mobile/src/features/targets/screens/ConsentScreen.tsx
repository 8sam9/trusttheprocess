import { router } from 'expo-router';
import { Button, TaskScreen } from '@/components/ui';
import { signOut } from '@/features/auth/signIn';
import { track } from '@/lib/analytics';
import { copy } from '../copy';
import { ConsentBody } from '../components/Consent';
import { useStepViewed } from '../hooks';
import { useOnboarding } from '../OnboardingProvider';

/** S1. "I AGREE" only records the decision in memory; consent is stored with the final save (ADR 0005). */
export default function ConsentScreen() {
  const { dispatch } = useOnboarding();
  useStepViewed('consent');
  return (
    <TaskScreen
      tagline={false}
      primary={
        <Button
          label={copy.agree}
          onPress={() => {
            track({ name: 'health_consent_decided', decision: 'given', surface: 'onboarding' });
            dispatch({ type: 'giveConsent' });
          }}
        />
      }
      secondary={
        <>
          <Button
            label={copy.noThanks}
            variant="secondary"
            size="cta"
            onPress={() => {
              track({
                name: 'health_consent_decided',
                decision: 'declined',
                surface: 'onboarding',
              });
              router.push('/onboarding/declined');
            }}
          />
          <Button label={copy.signOut} variant="text" onPress={() => void signOut()} />
        </>
      }
    >
      <ConsentBody />
    </TaskScreen>
  );
}
