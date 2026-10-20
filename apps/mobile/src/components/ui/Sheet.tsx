import { glyph, minTouch, radius, space } from '@ttp/ui';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWideWeb } from '@/lib/a11y';
import { useColors } from '@/lib/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  title: string;
  /** Close button, hardware back and swipe down. When `dirty`, a discard confirmation is shown first. */
  onClose: () => void;
  /** Shown instead of Close's default behaviour when set: a "Back" chevron for pushed pages. */
  onBack?: () => void;
  dirty?: boolean;
  /** Increment to open the discard confirm from outside (a Cancel button in the footer). */
  discardToken?: number;
  /** Copy for the discard confirm. */
  discard?: { title: string; discard: string; keep: string };
  children: ReactNode;
  /** Inline message pinned directly above the footer, so errors are visible without scrolling. */
  notice?: ReactNode;
  footer?: ReactNode;
}

/**
 * Bottom sheet on native (iOS page sheet), dialog on wide web, RN Modal everywhere. Focus moves to the title
 * on open. Dismissing while dirty asks to discard first (the confirm is in-tree because Alert is a no-op on web).
 */
export function Sheet({
  visible,
  title,
  onClose,
  onBack,
  dirty,
  discardToken = 0,
  discard = { title: 'Discard your changes?', discard: 'Discard', keep: 'Keep editing' },
  children,
  notice,
  footer,
}: SheetProps) {
  const c = useColors();
  const wide = useWideWeb();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const titleRef = useRef<ComponentRef<typeof View>>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      const node = titleRef.current;
      if (!node) return;
      if (Platform.OS === 'web') {
        (node as unknown as { focus?: () => void }).focus?.();
      } else {
        const handle = findNodeHandle(node);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }
    }, 150);
    return () => clearTimeout(id);
  }, [visible, title]);

  // A new discardToken (a footer Cancel) opens the confirm: derived state, adjusted during render.
  const [seenToken, setSeenToken] = useState(discardToken);
  if (discardToken !== seenToken) {
    setSeenToken(discardToken);
    setConfirming(true);
  }

  const requestClose = () => {
    if (onBack) return onBack();
    if (dirty) setConfirming(true);
    else onClose();
  };

  const isIosSheet = Platform.OS === 'ios';
  const panelStyle = wide
    ? ({ width: 480, maxHeight: '90%', borderRadius: radius.card, alignSelf: 'center' } as const)
    : isIosSheet
      ? ({ flex: 1 } as const)
      : ({ height: height * 0.9, borderTopLeftRadius: 20, borderTopRightRadius: 20 } as const);

  return (
    <Modal
      visible={visible}
      transparent={!isIosSheet}
      animationType={wide ? 'fade' : 'slide'}
      {...(isIosSheet ? { presentationStyle: 'pageSheet' as const } : {})}
      allowSwipeDismissal={!dirty}
      onRequestClose={requestClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: wide ? 'center' : 'flex-end',
          backgroundColor: isIosSheet ? c.background : 'rgba(0,0,0,0.55)',
        }}
      >
        {!isIosSheet ? (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={requestClose}
          />
        ) : null}
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          aria-label={title}
          style={[{ backgroundColor: c.background, overflow: 'hidden' }, panelStyle]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              padding: space.md,
              paddingTop: space.lg,
            }}
          >
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={onBack}
                style={{
                  width: minTouch,
                  height: minTouch,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RNText style={{ color: c.text, ...glyph.lg }}>{'‹'}</RNText>
              </Pressable>
            ) : null}
            <View ref={titleRef} accessible focusable={Platform.OS === 'web'} style={{ flex: 1 }}>
              <Text variant="headline">{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => (dirty ? setConfirming(true) : onClose())}
              style={{
                width: minTouch,
                height: minTouch,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RNText style={{ color: c.text, ...glyph.sm }}>{'✕'}</RNText>
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: space.lg, paddingTop: space.xs, gap: space.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {notice ? (
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>{notice}</View>
          ) : null}
          {footer ? (
            <View
              style={{
                padding: space.lg,
                paddingBottom: space.lg + insets.bottom,
                gap: space.sm,
                backgroundColor: c.background,
              }}
            >
              {footer}
            </View>
          ) : null}
          {confirming ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: 'rgba(0,0,0,0.55)',
                justifyContent: 'center',
                padding: space.lg,
              }}
            >
              <View
                role="alertdialog"
                accessibilityViewIsModal
                style={{
                  backgroundColor: c.surface,
                  borderRadius: radius.card,
                  padding: space.lg,
                  gap: space.sm,
                }}
              >
                <Text variant="title">{discard.title}</Text>
                <Button
                  label={discard.discard}
                  variant="danger"
                  onPress={() => {
                    setConfirming(false);
                    onClose();
                  }}
                />
                <Button
                  label={discard.keep}
                  variant="secondary"
                  onPress={() => setConfirming(false)}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
