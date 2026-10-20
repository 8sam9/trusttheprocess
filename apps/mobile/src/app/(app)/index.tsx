import { localDateIn } from '@ttp/shared';
import { space } from '@ttp/ui';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, LaneBar, MacroTrio, Screen, Text } from '@/components/ui';
import { useProfile } from '@/features/profile/api';
import { useCurrentTargets } from '@/features/targets/api';
import { copy } from '@/features/targets/copy';
import { usePlanSaved } from '@/features/targets/planSaved';
import { deviceTimeZone } from '@/lib/locale';
import { formatInt, formatWeekdayDay } from '@/lib/format';
import { useColors } from '@/lib/theme';

export default function TodayScreen() {
  const profile = useProfile();
  const targets = useCurrentTargets();
  const { saved } = usePlanSaved();
  const c = useColors();
  const name = profile.data?.display_name;
  const dateLabel = formatWeekdayDay(localDateIn(profile.data?.timezone ?? deviceTimeZone()));
  const t = targets.summary;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text variant="label" tone="muted">
          {dateLabel}
        </Text>
        <Text variant="display">{name ? `Hi ${name}` : 'Today'}</Text>
      </View>

      {profile.isPending && !t ? (
        <ActivityIndicator accessibilityLabel="Loading profile" color={c.accent} />
      ) : null}
      {profile.isError && !t ? (
        <Text tone="danger">Couldn’t load your profile. Try again in a moment.</Text>
      ) : null}

      {t ? (
        <Card>
          <Text variant="label" tone="muted">
            {copy.todayTarget}
          </Text>
          <View
            accessible
            accessibilityLabel={`Today's target, ${formatInt(t.kcal)} kcal`}
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: space.xs,
              flexWrap: 'wrap',
            }}
          >
            <Text variant="numberXL" tone="accent">
              {formatInt(t.kcal)}
            </Text>
            <Text variant="label" tone="muted">
              {copy.kcal}
            </Text>
          </View>
          <MacroTrio macros={{ proteinG: t.protein_g, carbsG: t.carbs_g, fatG: t.fat_g }} />
          <LaneBar value={0} label={copy.loggedOf(formatInt(t.kcal))} />
          <Text variant="bodyRegular" tone="muted">
            {copy.planSet}
          </Text>
          {saved ? (
            <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
              {copy.planSaved}
            </Text>
          ) : null}
        </Card>
      ) : targets.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading your targets" color={c.accent} />
      ) : null}

      <View style={{ marginTop: space.sm }}>
        <Button label="Profile & settings" onPress={() => router.push('/settings')} />
      </View>
    </Screen>
  );
}
