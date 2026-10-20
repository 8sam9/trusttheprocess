import { radius, space } from '@ttp/ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { announce } from '@/lib/a11y';
import { useColors } from '@/lib/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface NoticeProps {
  /** `info` is a neutral 3 pt rule (floor and guard notes); `danger` is for save errors. Never amber (reserved for AI estimates). */
  tone?: 'info' | 'danger';
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
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion={live ? 'polite' : undefined}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: tone === 'danger' ? c.danger : c.border,
        backgroundColor: c.surface,
        borderRadius: radius.chip,
        padding: space.sm,
        gap: space.xs,
      }}
    >
      <Text variant="bodyRegular" tone={tone === 'danger' ? 'danger' : 'default'}>
        {children}
      </Text>
      {action ? <Button variant="text" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
