/** Public, build-time config. Only EXPO_PUBLIC_* values are available in the app (and they are public!). */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};

export const isConfigured = env.supabaseUrl.length > 0 && env.supabaseKey.length > 0;

const PRIVACY_PLACEHOLDER = 'https://example.com/privacy-policy-placeholder';

/**
 * Privacy policy page (spec OQ 12). In development an unset EXPO_PUBLIC_PRIVACY_URL falls back to a placeholder
 * with a console warning. A production build never links to the placeholder: it returns null and the UI shows
 * "Privacy policy coming soon".
 */
export function resolvePrivacyUrl(
  value: string | undefined,
  production: boolean,
  warn: (message: string) => void = (m) => console.warn(m),
): string | null {
  if (value && value.trim().length > 0) return value.trim();
  if (production) return null;
  warn(
    'EXPO_PUBLIC_PRIVACY_URL is not set: the privacy link points to a placeholder. Set it before release.',
  );
  return PRIVACY_PLACEHOLDER;
}

const isProductionBuild =
  process.env.NODE_ENV === 'production' && !(typeof __DEV__ !== 'undefined' && __DEV__);

export const privacyUrl: string | null = resolvePrivacyUrl(
  process.env.EXPO_PUBLIC_PRIVACY_URL,
  isProductionBuild,
);
