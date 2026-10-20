import {
  GOAL_FOR_OPTION,
  PACE_PRESETS,
  cmToFtIn,
  type DailyTargetsRow,
  type ProfileRow,
  type UnitSystem,
} from '@ttp/shared';
import { space } from '@ttp/ui';
import { View } from 'react-native';
import { Button, Card, MacroTrio, Tag, Text } from '@/components/ui';
import { formatDayMonthYear, formatInt, sentenceCase } from '@/lib/format';
import { copy } from '../copy';
import { sentence } from '../derive';
import { rateToDisplay, trimNumber, weightToDisplay } from '../units';

/** "Moderate, 0.5 kg a week" / "Custom, 1.1 lb a week" from the stored kg rate, shown in the user's units. */
export function storedPaceText(goal: 'lose' | 'gain', kg: number, units: UnitSystem): string {
  const all = [...PACE_PRESETS[goal].metric, ...PACE_PRESETS[goal].imperial];
  const preset = all.find((p) => Math.abs(p.kg - kg) <= 0.005);
  const name = preset ? sentenceCase(copy.paceNames[preset.id]) : sentenceCase(copy.paceCustomTitle);
  const shown = trimNumber(rateToDisplay(kg, units), units === 'metric' ? 2 : 1);
  return `${name}, ${shown} ${units === 'metric' ? 'kg' : 'lb'} a week`;
}

/** The goal, pace and activity line of the Daily targets card. */
export function inputsLine(row: DailyTargetsRow, units: UnitSystem): string {
  const parts: string[] = [];
  const goalTitle = sentence(copy.goalCards[row.goal_option].title);
  if (GOAL_FOR_OPTION[row.goal_option] === 'maintain') {
    parts.push(goalTitle, copy.steadyWeightShort);
  } else {
    parts.push(goalTitle, storedPaceText(row.goal === 'gain' ? 'gain' : 'lose', row.weekly_rate_kg, units));
  }
  parts.push(copy.activityShort[row.activity_level]);
  return parts.join(' · ');
}

/** "Female · born 1996 · 165 cm · 65 kg" from the saved profile, in the user's units. */
export function statsLine(profile: ProfileRow): string {
  const parts: string[] = [];
  if (profile.sex) parts.push(copy.labels[profile.sex]);
  if (profile.birth_year !== null) parts.push(`born ${profile.birth_year}`);
  if (profile.height_cm !== null) {
    if (profile.units === 'metric') parts.push(`${trimNumber(profile.height_cm, 1)} cm`);
    else {
      const ftIn = cmToFtIn(profile.height_cm);
      parts.push(`${ftIn.ft} ft ${ftIn.in} in`);
    }
  }
  if (profile.weight_kg !== null) {
    parts.push(`${weightToDisplay(profile.weight_kg, profile.units)} ${profile.units === 'metric' ? 'kg' : 'lb'}`);
  }
  return parts.join(' · ');
}

/** Settings "DAILY TARGETS" card (S9): stored numbers only, never recomputed (AC 23, 27). */
export function DailyTargetsCard({
  profile,
  row,
  onEdit,
}: {
  profile: ProfileRow;
  row: DailyTargetsRow;
  onEdit: () => void;
}) {
  return (
    <Card>
      <Text variant="title">{copy.dailyTargetsTitle}</Text>
      <View
        accessible
        accessibilityLabel={`${formatInt(row.kcal)} kcal a day`}
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, flexWrap: 'wrap' }}
      >
        <Text variant="headline">{formatInt(row.kcal)}</Text>
        <Text variant="label" tone="muted">
          {copy.kcalADay}
        </Text>
      </View>
      <MacroTrio macros={{ proteinG: row.protein_g, carbsG: row.carbs_g, fatG: row.fat_g }} />
      <Text variant="small" tone="muted">
        {inputsLine(row, profile.units)}
      </Text>
      <Text variant="small" tone="muted">
        {statsLine(profile)}
      </Text>
      {row.is_custom || row.floor_applied ? (
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {row.is_custom ? <Tag label={copy.tagCustom} /> : null}
          {row.floor_applied ? <Tag label={copy.tagFloor} /> : null}
        </View>
      ) : null}
      <Text variant="small" tone="muted">
        {copy.inEffectSince(formatDayMonthYear(row.effective_from))}
      </Text>
      {profile.health_data_consent_at === null ? (
        <Text variant="small" tone="muted">
          {copy.consentOff}
        </Text>
      ) : null}
      <Button label={copy.editTargets} variant="secondary" onPress={onEdit} />
    </Card>
  );
}
