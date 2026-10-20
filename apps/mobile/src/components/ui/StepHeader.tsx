import { glyph, minTouch, space } from '@ttp/ui';
import { Pressable, Text as RNText, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { BrandMark } from './BrandMark';
import { LaneSegments } from './LaneBar';
import { Text } from './Text';

export const STEP_COUNT = 5;

/**
 * Optional Back button, then BrandMark + "STEP n OF 5" + a 5-segment lane bar, announced as one progress element
 * ("Step 2 of 5"). The Back button is the screen's only back control (the stack header is hidden).
 */
export function StepHeader({
  step,
  total = STEP_COUNT,
  onBack,
  backDisabled,
}: {
  step: number;
  total?: number;
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  const c = useColors();
  const spoken = `Step ${step} of ${total}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityState={{ disabled: !!backDisabled }}
          aria-disabled={!!backDisabled}
          disabled={backDisabled}
          onPress={onBack}
          style={{
            width: minTouch,
            height: minTouch,
            marginLeft: -space.xs,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: backDisabled ? 0.45 : 1,
          }}
        >
          <RNText style={{ color: c.text, ...glyph.lg }}>{'‹'}</RNText>
        </Pressable>
      ) : null}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={spoken}
        accessibilityValue={{ min: 1, max: total, now: step, text: spoken }}
        aria-valuetext={spoken}
        style={{ flex: 1, gap: space.sm }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <BrandMark size={24} />
          <Text variant="label" tone="muted">{`STEP ${step} OF ${total}`}</Text>
        </View>
        <LaneSegments filled={step} segments={total} />
      </View>
    </View>
  );
}
