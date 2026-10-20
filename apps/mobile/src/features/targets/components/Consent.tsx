import { badge, radius, space } from '@ttp/ui';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, View } from 'react-native';
import { BrandMark, Card, Text } from '@/components/ui';
import { privacyUrl } from '@/lib/env';
import { useColors } from '@/lib/theme';
import { copy } from '../copy';

/** Numbered volt square + title + detail (the sign-in screen's pattern, documented as FactRow in the DS). */
function FactRow({ n, title, detail }: { n: number; title: string; detail: string }) {
  const c = useColors();
  return (
    <View
      style={{ flexDirection: 'row', gap: space.sm }}
      accessible
      accessibilityLabel={`${title}. ${detail}`}
    >
      <View
        style={{
          width: badge.size,
          height: badge.size,
          borderRadius: radius.badge,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          variant="number"
          style={{ color: c.onAccent, fontSize: badge.fontSize, lineHeight: badge.lineHeight }}
        >
          {String(n).padStart(2, '0')}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text>{title}</Text>
        <Text variant="small" tone="muted">
          {detail}
        </Text>
      </View>
    </View>
  );
}

function openPrivacy(): void {
  if (!privacyUrl) return;
  if (Platform.OS === 'web') {
    window.open(privacyUrl, '_blank', 'noopener,noreferrer');
  } else {
    void WebBrowser.openBrowserAsync(privacyUrl);
  }
}

/** The content of the consent step (S1): facts, privacy link and the statement. Buttons are the caller's. */
export function ConsentBody({ returning, inSheet }: { returning?: boolean; inSheet?: boolean }) {
  return (
    <View style={{ gap: space.md }}>
      {inSheet ? null : (
        <>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <BrandMark size={24} />
            <Text variant="label" tone="muted">
              {copy.consentEyebrow}
            </Text>
          </View>
          <Text variant="display">{copy.consentTitle}</Text>
        </>
      )}
      <Text variant="bodyRegular" tone="muted">
        {returning ? copy.consentWithdrawn : copy.consentIntro}
      </Text>
      <Card>
        {copy.consentFacts.map((f, i) => (
          <FactRow key={f.title} n={i + 1} title={f.title} detail={f.detail} />
        ))}
      </Card>
      {privacyUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={copy.privacyLink}
          onPress={openPrivacy}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text tone="accent" style={{ textDecorationLine: 'underline' }}>
            {copy.privacyLink}
          </Text>
        </Pressable>
      ) : (
        <Text tone="muted">{copy.privacyComingSoon}</Text>
      )}
      <Text variant="small">{copy.consentStatement}</Text>
    </View>
  );
}
