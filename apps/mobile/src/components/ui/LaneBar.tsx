import { View } from 'react-native';
import { useColors } from '@/lib/theme';

/** The coloured segments only (no accessibility semantics); LaneBar and StepHeader wrap it. */
export function LaneSegments({ filled, segments }: { filled: number; segments: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
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

/** Segmented "lane" progress bar. `valueText` replaces the spoken percentage, e.g. "Step 2 of 5". */
export function LaneBar({
  value,
  segments = 10,
  label,
  valueText,
}: {
  value: number;
  segments?: number;
  label: string;
  valueText?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * segments);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clamped * 100),
        ...(valueText ? { text: valueText } : {}),
      }}
      aria-valuetext={valueText}
    >
      <LaneSegments filled={filled} segments={segments} />
    </View>
  );
}
