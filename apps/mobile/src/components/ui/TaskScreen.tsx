import { space } from '@ttp/ui';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeyboardVisible, useLargeText } from '@/lib/a11y';
import { useColors } from '@/lib/theme';
import { columnStyle } from './Screen';
import { Text } from './Text';

export const TAGLINE = 'Trust the process. Show up, log, repeat.';

/**
 * A task screen: scrolling content with the primary action pinned below it (above the keyboard).
 * At font scale >= 1.5 the footer unpins and scrolls with the content (only the primary action stays pinned
 * while the keyboard is open), and the decorative tagline is hidden.
 */
export function TaskScreen({
  header,
  children,
  notice,
  primary,
  secondary,
  tagline = true,
  footnote,
}: {
  header?: ReactNode;
  children: ReactNode;
  /** An inline message shown directly above the buttons (errors, "Pick one to continue."). */
  notice?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  tagline?: boolean;
  /** Small muted text pinned directly above the primary action (e.g. a disclaimer that must be on first paint). */
  footnote?: string;
}) {
  const c = useColors();
  const large = useLargeText();
  const keyboard = useKeyboardVisible();
  const showTagline = tagline && !large && !keyboard;

  const footerGap = { gap: space.sm } as const;
  const note = footnote ? (
    <Text variant="small" tone="muted">
      {footnote}
    </Text>
  ) : null;
  const scrollingFooter =
    large && !keyboard ? (
      <View style={footerGap}>
        {notice}
        {note}
        {primary}
        {secondary}
      </View>
    ) : null;
  const pinned = large ? (
    keyboard ? (
      <View style={footerGap}>{primary}</View>
    ) : null
  ) : (
    <View style={footerGap}>
      {notice}
      {note}
      {primary}
      {secondary}
      {showTagline ? (
        <Text
          variant="small"
          tone="muted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={{ textAlign: 'center' }}
        >
          {TAGLINE}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={[columnStyle, { padding: space.lg, gap: space.md }]}>
            {header}
            {children}
            {scrollingFooter}
          </View>
        </ScrollView>
        {pinned ? (
          <View style={{ backgroundColor: c.background }}>
            <View style={[columnStyle, { paddingHorizontal: space.lg, paddingVertical: space.sm }]}>
              {pinned}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
