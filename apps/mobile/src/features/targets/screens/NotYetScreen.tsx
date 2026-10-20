import { Button, BrandMark, TaskScreen, Text } from '@/components/ui';
import { signOut } from '@/features/auth/signIn';
import { copy } from '../copy';
import { DeleteAccountSection } from '../components/DeleteAccountSection';
import { useOnboarding } from '../OnboardingProvider';

/** S2b. Under 16: kind, final, and honest that nothing was kept. */
export default function NotYetScreen() {
  const { dispatch } = useOnboarding();
  return (
    <TaskScreen
      tagline={false}
      primary={
        <Button
          label={copy.signOut}
          variant="secondary"
          size="cta"
          onPress={() => void signOut()}
        />
      }
      secondary={
        <>
          <DeleteAccountSection label={copy.deleteMyAccount} />
          <Button
            label={copy.wrongYear}
            variant="text"
            onPress={() => dispatch({ type: 'wrongYear' })}
          />
        </>
      }
    >
      <BrandMark size={32} />
      <Text variant="display">{copy.underageTitle}</Text>
      <Text variant="bodyRegular">{copy.underageBody}</Text>
      <Text variant="bodyRegular" tone="muted">
        {copy.underageBody2}
      </Text>
    </TaskScreen>
  );
}
