import { type as typeScale, type TypeVariant } from '@ttp/ui';
import type { ComponentProps } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { useColors } from '@/lib/theme';

export type Tone = 'default' | 'muted' | 'accent' | 'danger' | 'warning';

export function Text({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; tone?: Tone; ref?: ComponentProps<typeof RNText>['ref'] }) {
  const c = useColors();
  const color = {
    default: c.text,
    muted: c.textMuted,
    accent: c.accentText,
    danger: c.danger,
    warning: c.warningText,
  }[tone];
  const isHeader = variant === 'display' || variant === 'headline' || variant === 'title';
  return (
    <RNText
      accessibilityRole={isHeader ? 'header' : undefined}
      maxFontSizeMultiplier={variant === 'numberXL' ? 1.4 : undefined}
      style={[typeScale[variant], { color }, style]}
      {...rest}
    />
  );
}
