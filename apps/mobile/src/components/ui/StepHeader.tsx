import { space } from '@ttp/ui';
import { View } from 'react-native';
import { BrandMark } from './BrandMark';
import { LaneSegments } from './LaneBar';
import { Text } from './Text';

export const STEP_COUNT = 5;

/** BrandMark + "STEP n OF 5" + a 5-segment lane bar, announced as one progress element ("Step 2 of 5"). */
export function StepHeader({ step, total = STEP_COUNT }: { step: number; total?: number }) {
  const spoken = `Step ${step} of ${total}`;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={spoken}
      accessibilityValue={{ min: 1, max: total, now: step, text: spoken }}
      aria-valuetext={spoken}
      style={{ gap: space.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BrandMark size={24} />
        <Text variant="label" tone="muted">{`STEP ${step} OF ${total}`}</Text>
      </View>
      <LaneSegments filled={step} segments={total} />
    </View>
  );
}
