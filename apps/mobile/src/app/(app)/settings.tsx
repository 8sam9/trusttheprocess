import { type ProfileRow, type UnitSystem } from '@ttp/shared';
import { space } from '@ttp/ui';
import type { Session } from '@supabase/supabase-js';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Choice, Screen, Text, TextField } from '@/components/ui';
import { signOut } from '@/features/auth/signIn';
import { useHealthConsent, useProfile, useUpdateProfile } from '@/features/profile/api';
import { formFromRow, updateFromForm } from '@/features/profile/form';
import { toSaveFailure, useApplyTargets, useCurrentTargets } from '@/features/targets/api';
import { DailyTargetsCard } from '@/features/targets/components/DailyTargetsCard';
import { DeleteAccountSection } from '@/features/targets/components/DeleteAccountSection';
import { TargetsSheet } from '@/features/targets/components/TargetsSheet';
import { copy } from '@/features/targets/copy';
import { draftFromProfile } from '@/features/targets/draft';
import { argsForPlan } from '@/features/targets/save';
import { useAuth } from '@/lib/auth';
import { track } from '@/lib/analytics';
import { deviceTimeZone } from '@/lib/locale';

const unitOptions = [
  { value: 'metric', label: copy.labels.metric },
  { value: 'imperial', label: copy.labels.imperial },
] as const satisfies readonly { value: UnitSystem; label: string }[];

export default function SettingsScreen() {
  const { session } = useAuth();
  const profile = useProfile();

  if (!profile.data || !session) {
    return (
      <Screen>
        {profile.isError ? (
          <>
            <Text tone="danger">Couldn’t load your profile.</Text>
            <Button label="Try again" onPress={() => void profile.refetch()} />
          </>
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
  const apply = useApplyTargets();
  const targets = useCurrentTargets();
  const [name, setName] = useState(() => formFromRow(row).displayName);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [applied, setApplied] = useState(false);

  const save = (changes: { displayName?: string; units?: UnitSystem }) => {
    setSaved(false);
    const form = { ...formFromRow(row), ...changes };
    update.mutate(
      { userId: session.user.id, changes: updateFromForm(form, deviceTimeZone()) },
      { onSuccess: () => setSaved(true) },
    );
  };

  const hasConsent = !!row.health_data_consent_at;
  const stored = targets.row;

  return (
    <Screen>
      <Text variant="label" tone="muted">
        Signed in as {session.user.email ?? 'your account'}
      </Text>

      {row.onboarding_completed_at && stored ? (
        <>
          <DailyTargetsCard
            profile={row}
            row={stored}
            onEdit={() => {
              track({ name: 'targets_adjust_opened', source: 'settings' });
              setApplied(false);
              setEditing(true);
            }}
          />
          {applied ? (
            <Text tone="accent" accessibilityLiveRegion="polite">
              {copy.newTargetsInEffect}
            </Text>
          ) : null}
        </>
      ) : null}

      <Text variant="display">Profile</Text>
      <TextField
        label="Name (optional)"
        value={name}
        onChangeText={(t) => {
          setSaved(false);
          setName(t);
        }}
        onBlur={() => {
          if (name.trim() !== (row.display_name ?? '')) save({ displayName: name });
        }}
        maxLength={50}
      />
      <Choice
        label={copy.labels.units}
        value={row.units}
        options={unitOptions}
        onChange={(v) => {
          if (v !== row.units) save({ units: v });
        }}
      />
      {update.isError ? (
        <Text tone="danger">Please check the highlighted values and try again.</Text>
      ) : null}
      {saved ? (
        <Text tone="accent" accessibilityLiveRegion="polite">
          {copy.saved}
        </Text>
      ) : null}

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
      <Button label={copy.signOut} variant="secondary" onPress={() => void signOut()} />
      <View style={{ gap: space.sm }}>
        <DeleteAccountSection />
      </View>

      {editing && stored ? (
        <TargetsSheet
          mode="settings"
          seed={draftFromProfile(row, stored, null)}
          stored={{
            kcal: stored.kcal,
            proteinG: stored.protein_g,
            carbsG: stored.carbs_g,
            fatG: stored.fat_g,
            isCustom: stored.is_custom,
          }}
          hasConsent={hasConsent}
          onClose={() => setEditing(false)}
          onApply={async (_draft, plan, opts) => {
            try {
              await apply.mutateAsync(
                argsForPlan(plan, { timezone: deviceTimeZone(), giveConsent: opts.giveConsent }),
              );
              setApplied(true);
              return 'ok';
            } catch (error) {
              const kind = toSaveFailure(error);
              track({ name: 'onboarding_save_failed', reason: kind, stage: 'final_save' });
              return kind;
            }
          }}
        />
      ) : null}
    </Screen>
  );
}
