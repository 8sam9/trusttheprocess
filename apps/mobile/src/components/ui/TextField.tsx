import { radius, space, type as typeScale } from '@ttp/ui';
import type { Ref } from 'react';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { useColors } from '@/lib/theme';
import { Text } from './Text';

export function TextField({
  label,
  error,
  helper,
  accessibilityLabel,
  ref,
  ...rest
}: TextInputProps & {
  ref?: Ref<TextInputInstance>;
  label: string;
  error?: string | undefined;
  helper?: string;
  /** Overrides the spoken label when the visible one is short, e.g. "kg a week". */
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={error}
        aria-invalid={error ? true : undefined}
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
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="small" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
