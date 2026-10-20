import { radius, space } from '@ttp/ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { announce } from '@/lib/a11y';
import { useColors } from '@/lib/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface NoticeProps {
  /**
   * `info` is a neutral 3 pt rule (floor and guard notes); `danger` is for save errors; `warning` is the one amber
   * exception: the "faster than we recommend" pace message, which must stay next to the action it concerns.
   */
  tone?: 'info' | 'danger' | 'warning';
  children: string;
  /** Announce politely when it appears or its text changes. */
  live?: boolean;
  action?: { label: string; onPress: () => void };
}

export function Notice({ tone = 'info', children, live, action }: NoticeProps) {
  const c = useColors();
  useEffect(() => {
    if (live) announce(children);
  }, [live, children]);
  return (
    <View
      // One spoken element, unless it holds an action button that must stay reachable.
      accessible={!action}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      accessibilityLiveRegion={live ? 'polite' : undefined}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: tone === 'danger' ? c.danger : tone === 'warning' ? c.warning : c.border,
        backgroundColor: c.surface,
        borderRadius: radius.chip,
        padding: space.sm,
        gap: space.xs,
      }}
    >
      <Text
        variant="bodyRegular"
        tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'default'}
      >
        {children}
      </Text>
      {action ? <Button variant="text" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
