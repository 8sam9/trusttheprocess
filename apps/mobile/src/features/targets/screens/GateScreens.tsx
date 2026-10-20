import { space } from '@ttp/ui';
import { ActivityIndicator, View } from 'react-native';
import { BrandMark, Button, Notice } from '@/components/ui';
import { signOut } from '@/features/auth/signIn';
import { useColors } from '@/lib/theme';
import { copy } from '../copy';

/** S0 loading: nothing but the mark and a spinner, so no wrong screen flashes before the status is known. */
export function GateLoading() {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.background,
        gap: space.md,
      }}
    >
      <BrandMark size={40} />
      <ActivityIndicator accessibilityLabel={copy.loadingPlan} color={c.accent} />
    </View>
  );
}

/** S0 error: the profile can't be fetched, so we can't tell whether onboarding is done. Never guesses. */
export function GateError({ onRetry }: { onRetry: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: c.background,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <Notice tone="danger" live>
        {copy.loadError}
      </Notice>
      <Button label={copy.tryAgain} onPress={onRetry} />
      <Button label={copy.signOut} variant="text" onPress={() => void signOut()} />
    </View>
  );
}
