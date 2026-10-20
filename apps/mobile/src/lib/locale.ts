import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

/** The device region code ("US", "IT"), or null when unknown. Used to default units. */
export function deviceRegion(): string | null {
  try {
    const region = getLocales()[0]?.regionCode;
    if (region) return region;
  } catch {
    // fall through to the browser language
  }
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const match = /-([A-Za-z]{2})\b/.exec(navigator.language ?? '');
    return match?.[1]?.toUpperCase() ?? null;
  }
  return null;
}

/** The device IANA time zone, falling back to UTC when `Intl` gives nothing (old Android). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
