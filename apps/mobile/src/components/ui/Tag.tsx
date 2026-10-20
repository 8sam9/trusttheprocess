import { radius, space } from '@ttp/ui';
import { View } from 'react-native';
import { useColors } from '@/lib/theme';
import { Text } from './Text';

/** Small outlined label ("CUSTOM", "SAFETY MINIMUM", "NOT AVAILABLE"). Neutral: no colour meaning. */
export function Tag({ label }: { label: string }) {
  const c = useColors();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: radius.badge,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        paddingHorizontal: space.xs,
        paddingVertical: 2,
      }}
    >
      <Text variant="label">{label}</Text>
    </View>
  );
}
