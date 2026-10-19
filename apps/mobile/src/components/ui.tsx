import { ctaHeight, minTouch, radius, space, type as typeScale, type TypeVariant } from '@ttp/ui';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/lib/theme';

/**
 * Track Day primitives. Built only from @ttp/ui tokens (docs/design/DESIGN_SYSTEM.md).
 * Screens compose these; they never hard-code colours, sizes or font names.
 */

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  const content = <View style={{ padding: space.lg, gap: space.md }}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

type Tone = 'default' | 'muted' | 'accent' | 'danger' | 'warning';

export function Text({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; tone?: Tone }) {
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

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  accessibilityHint,
}: ButtonProps) {
  const c = useColors();
  const inactive = disabled || loading;
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? c.onAccent : variant === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: isPrimary ? ctaHeight : minTouch + 8,
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
        <RNText style={[isPrimary ? typeScale.button : typeScale.body, { color: fg }]}>
          {label}
        </RNText>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  ...rest
}: TextInputProps & { label: string; error?: string | undefined }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        style={[
          typeScale.bodyRegular,
          {
            minHeight: 52,
            borderWidth: 1.5,
            borderColor: error ? c.danger : c.border,
            borderRadius: radius.input,
            paddingHorizontal: space.sm + 2,
            color: c.text,
            backgroundColor: c.surface,
            fontSize: 17,
          },
        ]}
        {...rest}
      />
      {error ? <Text tone="danger">{error}</Text> : null}
    </View>
  );
}

/** Single choice shown as chips; the selected chip gets the accent outline (Track Day "radio card"). */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: minTouch,
                paddingHorizontal: space.sm,
                justifyContent: 'center',
                borderRadius: radius.chip,
                borderWidth: selected ? 2 : 1.5,
                borderColor: selected ? c.accentText : c.border, // accentText keeps 3:1 contrast in light mode
                backgroundColor: c.surface,
              }}
            >
              <RNText
                style={[
                  selected ? typeScale.body : typeScale.bodyRegular,
                  { color: c.text, fontSize: 15 },
                ]}
              >
                {o.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Brand mark: "TTP" in display type, volt. Decorative next to the full name, so hidden from screen readers. */
export function BrandMark({ size = 24 }: { size?: number }) {
  const c = useColors();
  return (
    <RNText
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        typeScale.display,
        { fontSize: size, lineHeight: size * 1.1, color: c.accentText, textTransform: 'none' },
      ]}
    >
      TTP
    </RNText>
  );
}

/** Segmented "lane" progress bar used for daily calories. */
export function LaneBar({
  value,
  segments = 10,
  label,
}: {
  value: number;
  segments?: number;
  label: string;
}) {
  const c = useColors();
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * segments);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 10,
            borderRadius: 2,
            backgroundColor: i < filled ? c.accent : c.trackEmpty,
          }}
        />
      ))}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      {children}
    </View>
  );
}
