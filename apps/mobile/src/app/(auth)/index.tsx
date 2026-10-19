import * as AppleAuthentication from 'expo-apple-authentication';
import { radius, space } from '@ttp/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BrandMark, Button, Screen, Text, TextField } from '@/components/ui';
import {
  EMAIL_RE,
  friendlyAuthError,
  isAppleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/features/auth/signIn';
import { useScheme } from '@/lib/theme';

type Step = { kind: 'email' } | { kind: 'code'; email: string };

const promises = [
  'Log a meal in seconds: type, scan or say it',
  'Barcode scanning free, forever',
  'No ads. Your data stays yours.',
] as const;

export default function SignInScreen() {
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const scheme = useScheme();

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
  const requestCode = () =>
    run(async () => {
      await sendEmailCode(email.trim());
      setStep({ kind: 'code', email: email.trim() });
    });

  return (
    <Screen>
      <BrandMark size={28} />
      <Text
        variant="numberXL"
        accessibilityRole="header"
        style={{ textTransform: 'uppercase', marginTop: space.sm }}
      >
        {'Trust\nthe\nprocess'}
      </Text>

      <View style={{ gap: space.sm, marginVertical: space.md }}>
        {promises.map((p, i) => (
          <View key={p} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Text variant="number" tone="accent" style={{ fontSize: 18 }}>
              {String(i + 1).padStart(2, '0')}
            </Text>
            <Text>{p}</Text>
          </View>
        ))}
      </View>

      {step.kind === 'email' ? (
        <View style={{ gap: space.sm }}>
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
            onSubmitEditing={() => emailValid && requestCode()}
          />
          <Button
            label="Email me a code"
            disabled={!emailValid}
            loading={busy}
            onPress={requestCode}
          />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
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
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Text variant="label" tone="muted" style={{ textAlign: 'center' }}>
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
          cornerRadius={radius.button}
          style={{ height: 54 }}
          onPress={() => run(signInWithApple)}
        />
      ) : null}
      <Button
        label="Continue with Google"
        variant="secondary"
        onPress={() => run(signInWithGoogle)}
        disabled={busy}
      />

      <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
        By continuing you agree to the Terms and Privacy Policy.
      </Text>
    </Screen>
  );
}
