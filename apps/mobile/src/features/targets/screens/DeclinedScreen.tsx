import { router } from 'expo-router';
import { Button, BrandMark, TaskScreen, Text } from '@/components/ui';
import { signOut } from '@/features/auth/signIn';
import { copy } from '../copy';
import { DeleteAccountSection } from '../components/DeleteAccountSection';

/** S1b. Zero network calls: nothing was sent, so there is nothing to undo. */
export default function DeclinedScreen() {
  return (
    <TaskScreen
      tagline={false}
      primary={
        <Button
          label={copy.reviewConsent}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/consent'))}
        />
      }
      secondary={
        <>
          <Button label={copy.signOut} variant="secondary" size="cta" onPress={() => void signOut()} />
          <DeleteAccountSection />
        </>
      }
    >
      <BrandMark size={32} />
      <Text variant="display">{copy.declinedTitle}</Text>
      <Text variant="bodyRegular">{copy.declinedBody}</Text>
      <Text variant="bodyRegular" tone="muted">
        {copy.declinedBody2}
      </Text>
    </TaskScreen>
  );
}
