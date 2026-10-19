import { router } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Button, Screen, Text } from '@/components/ui';
import { useProfile } from '@/features/profile/api';

export default function TodayScreen() {
  const profile = useProfile();
  const name = profile.data?.display_name;

  return (
    <Screen>
      <Text variant="headline">{name ? `Hi ${name}` : 'Hi there'}</Text>
      {profile.isPending ? <ActivityIndicator accessibilityLabel="Loading profile" /> : null}
      {profile.isError ? (
        <Text variant="error">Couldn’t load your profile. Pull to retry later.</Text>
      ) : null}
      <Text>
        Your food diary arrives in Milestone 1. For now you can set up your profile and check that
        sign-in, sync and account deletion work.
      </Text>
      <Button label="Profile & settings" onPress={() => router.push('/settings')} />
    </Screen>
  );
}
