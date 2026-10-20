import { minTouch, radius, space, type as typeScale } from '@ttp/ui';
import { useState, type ReactElement } from 'react';
import { Pressable, Text as RNText, TextInput, View } from 'react-native';
import { formatInt } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useColors } from '@/lib/theme';

/**
 * A − / value / + control. The value is editable. It reports raw requests (`value ± step` or the typed number)
 * and the owner clamps them, so limit messages stay in one place. At `min` or `max` the button is announced as
 * disabled and dimmed, but a press still reports the request so the owner can explain the limit.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  label,
  unitLabel = 'kcal',
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  /** Spoken label, e.g. "Daily calories, 1,330 kcal. Adjustable." */
  label: string;
  unitLabel?: string;
}) {
  const c = useColors();
  const [text, setText] = useState(formatInt(value));
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    // The owner changed the value (a tap, or a clamp): show it.
    setShownValue(value);
    setText(formatInt(value));
  }

  const commit = () => {
    const n = Number(text.replace(/[^\d]/g, ''));
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(formatInt(value));
      return;
    }
    onChange(n);
    setText(formatInt(value));
  };
  const dec = () => {
    haptics.selection();
    onChange(value - step);
  };
  const inc = () => {
    haptics.selection();
    onChange(value + step);
  };
  const atMin = value <= min;
  const atMax = value >= max;

  const button = (
    glyph: string,
    spoken: string,
    onPress: () => void,
    atLimit: boolean,
  ): ReactElement => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: atLimit }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: minTouch + 8,
        height: minTouch + 8,
        borderRadius: radius.button,
        borderWidth: 1.5,
        borderColor: c.border,
        backgroundColor: c.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: atLimit ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      <RNText style={[typeScale.number, { color: c.text, fontSize: 28, lineHeight: 32 }]}>
        {glyph}
      </RNText>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {button('−', `Decrease by ${step}`, dec, atMin)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <TextInput
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: `${formatInt(value)} ${unitLabel}` }}
          accessibilityActions={[
            { name: 'increment', label: `Increase by ${step}` },
            { name: 'decrement', label: `Decrease by ${step}` },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') inc();
            if (e.nativeEvent.actionName === 'decrement') dec();
          }}
          value={text}
          onChangeText={(t) => setText(t.replace(/[^\d]/g, '').slice(0, 5))}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          style={[
            typeScale.numberXL,
            {
              fontSize: 44,
              lineHeight: 48,
              minWidth: 120,
              textAlign: 'center',
              color: c.accentText,
              minHeight: minTouch,
            },
          ]}
        />
        <RNText style={[typeScale.label, { color: c.textMuted }]}>{unitLabel.toUpperCase()}</RNText>
      </View>
      {button('+', `Increase by ${step}`, inc, atMax)}
    </View>
  );
}
