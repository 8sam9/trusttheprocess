import { radius, space } from '@ttp/ui';
import type { ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { sentenceCase } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Tag } from './Tag';
import { Text } from './Text';

export interface RadioCardProps {
  title: string;
  description?: string;
  /** A number line under the title, e.g. "0.5 kg a week". */
  rate?: string;
  /** Extra plain line, e.g. the floor hint on a pace option. */
  hint?: string;
  selected: boolean;
  /** Shown dashed and muted with `tag`; not pressable. */
  unavailable?: boolean;
  tag?: string;
  /** `warning` turns the selected outline amber (custom pace above the recommendation). */
  tone?: 'default' | 'warning';
  onPress: () => void;
  /** Overrides the spoken label (default: "Title. Description. Rate. Hint."). */
  accessibilityLabel?: string;
  /** Content revealed under the header when selected (for example the custom pace input). */
  children?: ReactNode;
}

/** A tall, full-width choice with a title and descriptions (Track Day "radio card"). */
export function RadioCard({
  title,
  description,
  rate,
  hint,
  selected,
  unavailable,
  tag,
  tone = 'default',
  onPress,
  accessibilityLabel,
  children,
}: RadioCardProps) {
  const c = useColors();
  const outline = selected ? (tone === 'warning' ? c.warning : c.accentText) : c.border;
  const label =
    accessibilityLabel ??
    `${[sentenceCase(title), description, rate, hint]
      .filter((p): p is string => !!p)
      .map((p) => p.replace(/\.$/, ''))
      .join('. ')}.`;
  const textTone = unavailable ? 'muted' : 'default';
  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: selected ? 2 : 1.5,
        borderColor: outline,
        borderStyle: unavailable ? 'dashed' : 'solid',
        backgroundColor: c.surface,
      }}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected, disabled: !!unavailable }}
        disabled={unavailable}
        onPress={() => {
          haptics.selection();
          onPress();
        }}
        style={{
          minHeight: 64,
          padding: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}
          >
            <Text variant="title" tone={textTone}>
              {title}
            </Text>
            {unavailable && tag ? <Tag label={tag} /> : null}
          </View>
          {rate ? (
            <Text variant="number" tone={textTone}>
              {rate}
            </Text>
          ) : null}
          {description ? (
            <Text variant="small" tone="muted">
              {description}
            </Text>
          ) : null}
          {hint ? <Text variant="small">{hint}</Text> : null}
        </View>
        {selected ? (
          <RNText
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ color: tone === 'warning' ? c.warningText : c.accentText, fontSize: 22 }}
          >
            {'✓'}
          </RNText>
        ) : null}
      </Pressable>
      {selected && children ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.xs }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
