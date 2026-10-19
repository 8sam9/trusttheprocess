/**
 * Trust the Process — "Track Day" design system v1.
 * Source of truth for every colour, size and font in the app. Documented in docs/design/DESIGN_SYSTEM.md;
 * visual reference: the "Trust the Process — Visual Directions" design canvas (Track Day rows).
 *
 * Rules: dark-first; volt (#C8FF2E) marks action and progress and is used as a FILL with dark text on top.
 * Never use volt as text on light backgrounds (fails contrast) — use `accentText` instead.
 */

export const palette = {
  dark: {
    background: '#0B0D0C',
    surface: '#161A17',
    track: '#262B27', // dividers, empty progress
    trackEmpty: '#2C332E', // empty lane-bar segments
    border: '#3A423C',
    text: '#F4F7F2',
    textMuted: '#A3ABA5', // 8.3:1 on background
    textSubtle: '#C9D0CB',
    accent: '#C8FF2E', // volt — fills only
    onAccent: '#0B0D0C',
    accentText: '#C8FF2E', // accent used as text/links
    danger: '#FF5A5A',
    warning: '#FFB020', // AI estimates, things to double-check
    warningText: '#FFD27A',
  },
  light: {
    background: '#F5F7F3',
    surface: '#FFFFFF',
    track: '#E1E5E0',
    trackEmpty: '#E1E5E0',
    border: '#C9CFC8',
    text: '#0B0D0C',
    textMuted: '#5A635C',
    textSubtle: '#3A423C',
    accent: '#C8FF2E',
    onAccent: '#0B0D0C',
    accentText: '#3F5A00',
    danger: '#C42B2B',
    warning: '#FFB020',
    warningText: '#7A4D00',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)['dark']]: string };

/** Data colours — always paired with a text label, never the only signal. */
export const dataColors = {
  dark: { protein: '#F4F7F2', carbs: '#3DD6F5', fat: '#FF7A45' },
  light: { protein: '#0B0D0C', carbs: '#0A8FB0', fat: '#D9531E' },
} as const;

/** Food-source badges (data-quality layer, PRODUCT_SPEC N5). Text on all of them is #0B0D0C. */
export const sourceBadge = {
  verified: '#C8FF2E',
  brand: '#3DD6F5',
  community: '#C9D0CB',
  estimated: '#FFB020',
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { badge: 4, chip: 8, input: 10, button: 12, card: 14 } as const;

/** Minimum touch target (WCAG 2.5.8 / platform guidelines). */
export const minTouch = 44;
/** Height of primary call-to-action buttons. */
export const ctaHeight = 56;

/**
 * Font family names as registered by expo-font (see apps/mobile/src/lib/fonts.ts).
 * React Native needs one family per weight/style, so weights are baked into the name.
 */
export const fonts = {
  display: 'BarlowCondensed_800ExtraBold_Italic', // headlines, buttons, big numbers
  title: 'BarlowCondensed_800ExtraBold', // section titles (caps)
  number: 'BarlowCondensed_600SemiBold', // inline numbers
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemibold: 'Barlow_600SemiBold',
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase' | 'none';
}

export const type = {
  numberXL: { fontFamily: fonts.display, fontSize: 76, lineHeight: 72 },
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, textTransform: 'uppercase' },
  headline: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, textTransform: 'uppercase' },
  title: {
    fontFamily: fonts.title,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  number: { fontFamily: fonts.number, fontSize: 22, lineHeight: 26 },
  button: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  body: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  bodyRegular: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyleToken>;

export type TypeVariant = keyof typeof type;
