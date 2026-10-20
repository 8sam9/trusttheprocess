import { ctaHeight, minTouch, radius, space, type as typeScale } from '@ttp/ui';
import { ActivityIndicator, Pressable, Text as RNText } from 'react-native';
import { useColors } from '@/lib/theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** `text` is a low-emphasis neutral button; `danger` is the same in the danger colour. */
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  /** `cta` makes a secondary button the same 56 pt, `button`-type size as the primary (equal-weight choices). */
  size?: 'default' | 'cta';
  loading?: boolean;
  /** Accessibility label while loading, e.g. "Saving your plan". */
  busyLabel?: string;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  loading,
  busyLabel,
  disabled,
  accessibilityHint,
}: ButtonProps) {
  const c = useColors();
  const inactive = disabled || loading;
  const isPrimary = variant === 'primary';
  const isCta = isPrimary || size === 'cta';
  const fg = isPrimary ? c.onAccent : variant === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading && busyLabel ? busyLabel : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: isCta ? ctaHeight : minTouch + 8,
        borderRadius: radius.button,
        backgroundColor: isPrimary ? c.accent : 'transparent',
        borderWidth: variant === 'secondary' ? 1.5 : 0,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.md,
        opacity: inactive ? 0.45 : pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <RNText style={[isCta ? typeScale.button : typeScale.body, { color: fg, textAlign: 'center' }]}>
          {label}
        </RNText>
      )}
    </Pressable>
  );
}
