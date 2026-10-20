import { minTouch, radius, space, type as typeScale } from '@ttp/ui';
import { Pressable, Text as RNText, View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { useColors } from '@/lib/theme';
import { Text } from './Text';

/** Single choice shown as chips; the selected chip gets the accent outline. Exposes `checked` to screen readers. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: T | null | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  error?: string | undefined;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked }}
              onPress={() => {
                haptics.selection();
                onChange(o.value);
              }}
              style={{
                minHeight: minTouch,
                paddingHorizontal: space.sm,
                justifyContent: 'center',
                borderRadius: radius.chip,
                borderWidth: checked ? 2 : 1.5,
                borderColor: checked ? c.accentText : c.border, // accentText keeps 3:1 contrast in light mode
                backgroundColor: c.surface,
              }}
            >
              <RNText
                style={[
                  checked ? typeScale.body : typeScale.bodyRegular,
                  { color: c.text, fontSize: 15 },
                ]}
              >
                {o.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
