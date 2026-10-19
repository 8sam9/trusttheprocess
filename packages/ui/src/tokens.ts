/**
 * PLACEHOLDER tokens: neutral values so Milestone 0 screens render.
 * Replaced by the real design system in the "Design foundations" step (docs/design/DESIGN_SYSTEM.md).
 * Components must use these tokens, never hard-coded values, so the swap is a one-file change.
 */
export const palette = {
  light: {
    background: '#FFFFFF',
    surface: '#F4F4F5',
    text: '#18181B',
    textMuted: '#52525B',
    border: '#D4D4D8',
    accent: '#2563EB',
    onAccent: '#FFFFFF',
    danger: '#B91C1C',
    success: '#15803D',
  },
  dark: {
    background: '#09090B',
    surface: '#18181B',
    text: '#FAFAFA',
    textMuted: '#A1A1AA',
    border: '#3F3F46',
    accent: '#60A5FA',
    onAccent: '#09090B',
    danger: '#F87171',
    success: '#4ADE80',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)['light']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const fontSize = { caption: 12, body: 16, title: 20, headline: 28, display: 40 } as const;
export const fontWeight = { regular: '400', medium: '500', bold: '700' } as const;
/** Minimum touch target (WCAG / platform guidelines). */
export const minTouch = 44;
