import { space } from '@ttp/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { useDeleteAccount } from '@/features/profile/api';
import { copy } from '../copy';

/** Delete account with the existing two-step confirm (Settings, Consent declined, Not yet). */
export function DeleteAccountSection({ label = copy.deleteAccount }: { label?: string }) {
  const deleteAccount = useDeleteAccount();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return <Button label={label} variant="danger" onPress={() => setConfirm(true)} />;
  }
  return (
    <View style={{ gap: space.sm }}>
      <Text>{copy.deleteConfirm}</Text>
      {deleteAccount.isError ? <Text tone="danger">{copy.deleteFailed}</Text> : null}
      <Button
        label={copy.deleteYes}
        variant="danger"
        loading={deleteAccount.isPending}
        onPress={() => deleteAccount.mutate()}
      />
      <Button label={copy.cancel} variant="secondary" onPress={() => setConfirm(false)} />
    </View>
  );
}
