/** Public, build-time config. Only EXPO_PUBLIC_* values are available in the app (and they are public!). */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};

export const isConfigured = env.supabaseUrl.length > 0 && env.supabaseKey.length > 0;

/** Privacy policy page. A placeholder until the legal text is supplied (spec OQ 12). */
export const privacyUrl =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://example.com/privacy-policy-placeholder';
