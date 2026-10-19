import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { space } from '@ttp/ui';
import { Button, Screen, Text, TextField } from '@/components/ui';
import {
  EMAIL_RE,
  friendlyAuthError,
  isAppleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/features/auth/signIn';

type Step = { kind: 'email' } | { kind: 'code'; email: string };

export default function SignInScreen() {
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const scheme = useColorScheme();

  useEffect(() => {
    isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  const emailValid = EMAIL_RE.test(email.trim());

  return (
    <Screen>
      <Text variant="headline">Welcome</Text>
      <Text>Track what you eat in seconds. Sign in or create an account. It’s free.</Text>

      {step.kind === 'email' ? (
        <View style={{ gap: space.md }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            returnKeyType="send"
            onSubmitEditing={() =>
              emailValid &&
              run(async () => {
                await sendEmailCode(email.trim());
                setStep({ kind: 'code', email: email.trim() });
              })
            }
          />
          <Button
            label="Email me a sign-in code"
            disabled={!emailValid}
            loading={busy}
            onPress={() =>
              run(async () => {
                await sendEmailCode(email.trim());
                setStep({ kind: 'code', email: email.trim() });
              })
            }
          />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Text>We sent a 6-digit code to {step.email}.</Text>
          <TextField
            label="Code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder="123456"
          />
          <Button
            label="Sign in"
            disabled={code.length !== 6}
            loading={busy}
            onPress={() => run(() => verifyEmailCode(step.email, code))}
          />
          <Button
            label="Use a different email"
            variant="secondary"
            onPress={() => {
              setCode('');
              setStep({ kind: 'email' });
            }}
          />
        </View>
      )}

      {error ? (
        <Text variant="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Text variant="caption" style={{ textAlign: 'center' }}>
        or
      </Text>

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={10}
          style={{ height: 48 }}
          onPress={() => run(signInWithApple)}
        />
      ) : null}
      <Button
        label="Continue with Google"
        variant="secondary"
        onPress={() => run(signInWithGoogle)}
        disabled={busy}
      />

      <Text variant="caption">
        By continuing you agree to the Terms and Privacy Policy. We never sell your data and there
        are no ads.
      </Text>
    </Screen>
  );
}
