import { router } from 'expo-router';
import { space } from '@ttp/ui';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, LaneBar, Screen, Text } from '@/components/ui';
import { useProfile } from '@/features/profile/api';
import { useColors } from '@/lib/theme';

const today = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}).format(new Date());

export default function TodayScreen() {
  const profile = useProfile();
  const c = useColors();
  const name = profile.data?.display_name;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text variant="label" tone="muted">
          {today}
        </Text>
        <Text variant="display">{name ? `Hi ${name}` : 'Today'}</Text>
      </View>

      {profile.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading profile" color={c.accent} />
      ) : null}
      {profile.isError ? (
        <Text tone="danger">Couldn’t load your profile. Try again in a moment.</Text>
      ) : null}

      <Card>
        <Text variant="label" tone="muted">
          Coming in Milestone 1
        </Text>
        <Text variant="headline">Your food diary</Text>
        <LaneBar value={0} label="No calories logged yet" />
        <Text variant="bodyRegular" tone="muted">
          Calories, macros and meals land here next. For now: set up your profile and check that
          sign-in, sync and account deletion work.
        </Text>
      </Card>

      <View style={{ marginTop: space.sm }}>
        <Button label="Profile & settings" onPress={() => router.push('/settings')} />
      </View>
    </Screen>
  );
}
