import { glyph, space } from '@ttp/ui';
import { Pressable, Text as RNText, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { Text } from './Text';

/** Label + current value + chevron, at least 56 pt tall. */
export function ListRow({
  label,
  value,
  valueTone = 'muted',
  onPress,
}: {
  label: string;
  value: string;
  valueTone?: 'muted' | 'danger';
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        borderBottomWidth: 1,
        borderBottomColor: c.track,
        paddingVertical: space.xs,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text>{label}</Text>
        <Text variant="small" tone={valueTone}>
          {value}
        </Text>
      </View>
      <RNText
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ color: c.textMuted, ...glyph.md }}
      >
        {'›'}
      </RNText>
    </Pressable>
  );
}
