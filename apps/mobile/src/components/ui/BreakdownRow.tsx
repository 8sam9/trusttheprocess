import { space } from '@ttp/ui';
import { View } from 'react-native';
import { useLargeText } from '@/lib/a11y';
import { formatInt, formatSigned, spokenSigned } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Text } from './Text';

/**
 * One line of the maths panel: label (and optional muted sub-line) on the left, a right-aligned tabular value.
 * `signed` shows "−550" / "+275"; `total` adds the divider above. Read as one element:
 * "Deficit for your pace, minus 550 kcal".
 */
export function BreakdownRow({
  label,
  sub,
  value,
  signed,
  total,
  unit = 'kcal',
}: {
  label: string;
  sub?: string;
  value: number;
  signed?: boolean;
  total?: boolean;
  unit?: string;
}) {
  const c = useColors();
  const large = useLargeText();
  const shown = signed ? formatSigned(value) : formatInt(value);
  const spoken = signed ? spokenSigned(value) : formatInt(value);
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${spoken} ${unit}${sub ? `. ${sub}` : ''}`}
      style={{ gap: space.xs }}
    >
      {total ? <View style={{ height: 1, backgroundColor: c.track }} /> : null}
      <View
        style={{
          flexDirection: large ? 'column' : 'row',
          justifyContent: 'space-between',
          gap: space.xs,
        }}
      >
        <View style={{ flex: large ? undefined : 1, gap: 2 }}>
          <Text variant={total ? 'body' : 'bodyRegular'}>{label}</Text>
          {sub ? (
            <Text variant="small" tone="muted">
              {sub}
            </Text>
          ) : null}
        </View>
        <Text
          variant="number"
          tone={total ? 'accent' : 'default'}
          style={{ fontVariant: ['tabular-nums'], textAlign: large ? 'left' : 'right' }}
        >
          {shown}
        </Text>
      </View>
    </View>
  );
}
