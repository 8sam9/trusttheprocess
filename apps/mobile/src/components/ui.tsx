import { fontSize, fontWeight, minTouch, radius, space } from '@ttp/ui';
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
 * Milestone 0 primitives built only from design tokens.
 * They will be restyled when the design system lands; screens should not need to change.
 */

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  const content = <View style={{ padding: space.xl, gap: space.lg }}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

type Variant = 'body' | 'title' | 'headline' | 'caption' | 'error';

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const c = useColors();
  const map = {
    body: { fontSize: fontSize.body, color: c.text },
    caption: { fontSize: fontSize.caption, color: c.textMuted },
    title: { fontSize: fontSize.title, color: c.text, fontWeight: fontWeight.bold },
    headline: { fontSize: fontSize.headline, color: c.text, fontWeight: fontWeight.bold },
    error: { fontSize: fontSize.body, color: c.danger },
  } as const;
  return (
    <RNText
      accessibilityRole={variant === 'headline' || variant === 'title' ? 'header' : undefined}
      style={[map[variant], style]}
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
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : c.surface;
  const fg = variant === 'secondary' ? c.text : c.onAccent;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: minTouch,
        borderRadius: radius.md,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.lg,
        opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <RNText style={{ color: fg, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>
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
      <Text variant="caption">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        style={{
          minHeight: minTouch,
          borderWidth: 1,
          borderColor: error ? c.danger : c.border,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          color: c.text,
          backgroundColor: c.surface,
          fontSize: fontSize.body,
        }}
        {...rest}
      />
      {error ? <Text variant="error">{error}</Text> : null}
    </View>
  );
}

/** Segmented single choice (units, sex, goal…). */
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
      <Text variant="caption">{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
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
                paddingHorizontal: space.md,
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? c.accent : c.border,
                backgroundColor: selected ? c.accent : 'transparent',
              }}
            >
              <RNText style={{ color: selected ? c.onAccent : c.text, fontSize: fontSize.body }}>
                {o.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
