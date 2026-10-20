import { type as typeScale } from '@ttp/ui';
import { Text as RNText } from 'react-native';
import { useColors } from '@/lib/theme';

/** Brand mark: "TTP" in display type, volt. Decorative next to the full name, so hidden from screen readers. */
export function BrandMark({ size = 24 }: { size?: number }) {
  const c = useColors();
  return (
    <RNText
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        typeScale.display,
        { fontSize: size, lineHeight: size * 1.1, color: c.accentText, textTransform: 'none' },
      ]}
    >
      TTP
    </RNText>
  );
}
