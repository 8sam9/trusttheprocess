import {
  ACTIVITY_MULTIPLIER,
  type ActivityLevel,
  type BiologicalSex,
  type ProfileRow,
  type UnitSystem,
} from '@ttp/shared';
import { space } from '@ttp/ui';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Choice, Screen, Text, TextField } from '@/components/ui';
import { signOut } from '@/features/auth/signIn';
import {
  useDeleteAccount,
  useHealthConsent,
  useProfile,
  useUpdateProfile,
} from '@/features/profile/api';
import { formFromRow, updateFromForm, type ProfileForm } from '@/features/profile/form';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';

const unitOptions = [
  { value: 'metric', label: 'Metric (kg, cm)' },
  { value: 'imperial', label: 'Imperial (lb, ft)' },
] as const satisfies readonly { value: UnitSystem; label: string }[];

const sexOptions = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
] as const satisfies readonly { value: BiologicalSex; label: string }[];

const activityLabels: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting',
  light: 'Lightly active',
  moderate: 'Moderately active',
  active: 'Very active',
  very_active: 'Athlete',
};
const activityOptions = (Object.keys(ACTIVITY_MULTIPLIER) as ActivityLevel[]).map((v) => ({
  value: v,
  label: activityLabels[v],
}));

export default function SettingsScreen() {
  const { session } = useAuth();
  const profile = useProfile();

  if (!profile.data || !session) {
    return (
      <Screen>
        {profile.isError ? (
          <Text tone="danger">Couldn’t load your profile.</Text>
        ) : (
          <ActivityIndicator />
        )}
      </Screen>
    );
  }
  // Keyed by user so the form re-initialises if the account changes.
  return <SettingsForm key={session.user.id} row={profile.data} session={session} />;
}

function SettingsForm({ row, session }: { row: ProfileRow; session: Session }) {
  const update = useUpdateProfile();
  const consent = useHealthConsent();
  const deleteAccount = useDeleteAccount();
  const [form, setForm] = useState<ProfileForm>(() => formFromRow(row));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setSaved(false);
    setForm({ ...form, [key]: value });
  };

  const save = () =>
    update.mutate(
      {
        userId: session.user.id,
        changes: updateFromForm(form, Intl.DateTimeFormat().resolvedOptions().timeZone),
      },
      { onSuccess: () => setSaved(true) },
    );

  const hasConsent = !!row.health_data_consent_at;

  return (
    <Screen>
      <Text variant="label" tone="muted">
        Signed in as {session.user.email ?? 'your account'}
      </Text>

      <Text variant="display">Profile</Text>
      <TextField
        label="Name (optional)"
        value={form.displayName}
        onChangeText={(t) => set('displayName', t)}
        maxLength={50}
      />
      <Choice
        label="Units"
        value={form.units}
        options={unitOptions}
        onChange={(v) => set('units', v)}
      />
      <Choice
        label="Sex (used only to estimate your energy needs)"
        value={form.sex}
        options={sexOptions}
        onChange={(v) => set('sex', v)}
      />
      <TextField
        label="Year of birth"
        value={form.birthYear}
        onChangeText={(t) => set('birthYear', t)}
        keyboardType="number-pad"
        maxLength={4}
      />
      {form.units === 'metric' ? (
        <TextField
          label="Height (cm)"
          value={form.heightCm}
          onChangeText={(t) => set('heightCm', t)}
          keyboardType="decimal-pad"
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Height (ft)"
              value={form.heightFt}
              onChangeText={(t) => set('heightFt', t)}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="(in)"
              value={form.heightIn}
              onChangeText={(t) => set('heightIn', t)}
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}
      <Choice
        label="Activity level"
        value={form.activityLevel}
        options={activityOptions}
        onChange={(v) => set('activityLevel', v)}
      />

      {update.isError ? (
        <Text tone="danger">Please check the highlighted values and try again.</Text>
      ) : null}
      {saved ? (
        <Text tone="accent" accessibilityLiveRegion="polite">
          Saved ✓
        </Text>
      ) : null}
      <Button label="Save" onPress={save} loading={update.isPending} />

      <Text variant="title" style={{ marginTop: space.lg }}>
        Privacy
      </Text>
      <Text variant="bodyRegular" tone="muted">
        To track food and weight we store health-related data. It is never sold or shown to
        advertisers, and you can withdraw consent at any time.
      </Text>
      <Button
        label={hasConsent ? 'Withdraw health-data consent' : 'I consent to storing my health data'}
        variant="secondary"
        loading={consent.isPending}
        onPress={() => consent.mutate(!hasConsent)}
      />

      <Text variant="title" style={{ marginTop: space.lg }}>
        Account
      </Text>
      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      {!confirmDelete ? (
        <Button label="Delete account" variant="danger" onPress={() => setConfirmDelete(true)} />
      ) : (
        <View style={{ gap: space.sm }}>
          <Text>
            This permanently deletes your account and all your data. This can’t be undone.
          </Text>
          {deleteAccount.isError ? (
            <Text tone="danger">Deletion failed. Please try again.</Text>
          ) : null}
          <Button
            label="Yes, delete everything"
            variant="danger"
            loading={deleteAccount.isPending}
            onPress={() => deleteAccount.mutate()}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
        </View>
      )}
    </Screen>
  );
}
