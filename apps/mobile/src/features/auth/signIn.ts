import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession(); // required for the web OAuth popup/redirect to close

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Map Supabase auth errors to supportive, user-facing copy. Never surface raw server messages. */
export function friendlyAuthError(e: unknown): string {
  const message = e instanceof Error ? e.message.toLowerCase() : '';
  if (message.includes('expired') || message.includes('invalid'))
    return 'That code didn’t work. Check it or ask for a new one.';
  if (message.includes('rate') || message.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (message.includes('network') || message.includes('fetch'))
    return 'Can’t reach the server. Check your connection.';
  if (message.includes('canceled') || message.includes('cancelled')) return '';
  return 'Something went wrong. Please try again.';
}

export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple sign-in returned no identity token');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri({ scheme: 'trusttheprocess', path: 'auth-callback' });

  if (Platform.OS === 'web') {
    // Full-page redirect; the client exchanges ?code= on return (detectSessionInUrl).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('canceled');

  const url = new URL(result.url);
  const providerError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (providerError) throw new Error(providerError);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No auth code returned');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
