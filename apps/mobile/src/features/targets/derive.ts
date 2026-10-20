import {
  GOAL_FOR_OPTION,
  KCAL_PER_KG,
  PACE_PRESETS,
  RECOMMENDED_MAX_WEEKLY_RATE_KG,
  applyManualKcal,
  explainTargets,
  isLoseGoalGuarded,
  kgToLb,
  round,
  type FinalTargets,
  type Goal,
  type GoalOption,
  type ProfileInput,
  type TargetsBreakdown,
  type UnitSystem,
} from '@ttp/shared';
import { formatInt } from '@/lib/format';
import { copy } from './copy';
import { presetKg, type PaceId, type TargetsDraft } from './draft';
import { oneOrTwoDecimals, rateToDisplay, trimNumber } from './units';
import { validateAbout, validatePace, type AboutValues } from './validate';

export interface MathsRow {
  key: string;
  label: string;
  sub?: string;
  value: number;
  signed?: boolean;
  total?: boolean;
}

export interface PlanModel {
  input: ProfileInput;
  goalOption: GoalOption;
  breakdown: TargetsBreakdown;
  final: FinalTargets;
  /** Kg a week of the pace (0 for maintain). */
  rateKg: number;
  paceOption: PaceId | 'custom' | null;
  paceBand: 'le_0_75' | 'gt_0_75' | null;
  eyebrow: string;
  /** The floor explanation (C-f1 or C-f2), or null. */
  floorNotice: string | null;
  isCustom: boolean;
  rows: MathsRow[];
}

export const paceBandFor = (kg: number): 'le_0_75' | 'gt_0_75' =>
  kg > RECOMMENDED_MAX_WEEKLY_RATE_KG + 1e-9 ? 'gt_0_75' : 'le_0_75';

/** True when Lose fat must not be offered for these About you answers (never exposes the BMI). */
export function isGuarded(d: TargetsDraft, now: Date = new Date()): boolean {
  const about = validateAbout(d, now);
  if (!about.ok) return false;
  return isLoseGoalGuarded(about.value, now);
}

/** The goal option actually in force: a stored Lose fat is dropped when the guard has since become active. */
export function effectiveGoalOption(d: TargetsDraft, now: Date = new Date()): GoalOption | null {
  if (d.goalOption === 'lose_fat' && isGuarded(d, now)) return null;
  return d.goalOption;
}

/** Formats a rate in the user's unit for a preset: metric "0.25", imperial "0.5" / "1" / "1.5". */
export function presetRateText(kg: number, units: UnitSystem): string {
  return trimNumber(rateToDisplay(kg, units), units === 'metric' ? 2 : 1);
}

export const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

interface PaceLabels {
  name: string;
  rate: string;
}

/** Pace name and rate for an eyebrow or a summary row, e.g. MODERATE / "0.5". */
function paceLabels(rateKg: number, option: PaceId | 'custom', units: UnitSystem): PaceLabels {
  if (option === 'custom') {
    return { name: copy.paceCustomTitle, rate: oneOrTwoDecimals(rateToDisplay(rateKg, units)) };
  }
  return { name: copy.paceNames[option], rate: presetRateText(rateKg, units) };
}

function baseInput(
  about: AboutValues,
  d: TargetsDraft,
  goal: Goal,
  rateKg: number,
): ProfileInput | null {
  if (d.activity === null) return null;
  return {
    sex: about.sex,
    birthYear: about.birthYear,
    heightCm: about.heightCm,
    weightKg: about.weightKg,
    activityLevel: d.activity,
    goal,
    weeklyRateKg: rateKg,
    units: d.units,
  };
}

/** Kg a week for the chosen pace, or null when it is missing or invalid. Maintain is 0. */
export function chosenRateKg(d: TargetsDraft, goal: Goal): number | null {
  if (goal === 'maintain') return 0;
  return validatePace(d.pace, d.units, (id) => presetKg(goal, d.units, id)).kg;
}

/** Computes the whole plan from the draft, or null while the answers are incomplete or invalid. */
export function buildPlan(d: TargetsDraft, now: Date = new Date()): PlanModel | null {
  const about = validateAbout(d, now);
  const goalOption = effectiveGoalOption(d, now);
  if (!about.ok || goalOption === null) return null;
  const goal = GOAL_FOR_OPTION[goalOption];
  const rateKg = chosenRateKg(d, goal);
  if (rateKg === null) return null;
  const input = baseInput(about.value, d, goal, rateKg);
  if (!input) return null;

  const breakdown = explainTargets(input, now);
  const final = applyManualKcal(breakdown, d.customKcal ?? breakdown.calculatedKcal, input);
  const units = d.units;
  const floorText = formatInt(breakdown.floorKcal);

  // Pace identity for the eyebrow and analytics.
  const paceOption: PaceId | 'custom' | null =
    goal === 'maintain' || d.pace === null ? null : d.pace.kind === 'custom' ? 'custom' : d.pace.id;

  let eyebrow: string;
  let floorNotice: string | null = null;
  const goalName = copy.goalName[goalOption];
  if (breakdown.floorApplied) {
    if (breakdown.floorAtOrAboveMaintenance || (breakdown.impliedWeeklyRateKg ?? 0) <= 0) {
      eyebrow = `${goalName} · ${copy.steadyWeightAtTarget}`;
      floorNotice = copy.floorMaintenance(floorText);
    } else {
      const implied = breakdown.impliedWeeklyRateKg ?? 0;
      const tiny = implied < 0.05;
      const shown = trimNumber(rateToDisplay(implied, units), 1);
      eyebrow = tiny
        ? `${goalName} · ${copy.eyebrowLessThan(units)}`
        : `${goalName} · ${copy.eyebrowAboutRate(shown, units)}`;
      floorNotice = copy.floorPace(
        floorText,
        tiny ? copy.floorRatePhraseTiny(units) : copy.floorRatePhrase(shown, units),
      );
    }
  } else if (paceOption !== null) {
    const labels = paceLabels(rateKg, paceOption, units);
    eyebrow = `${goalName} · ${labels.name} · ${copy.eyebrowRate(labels.rate, units)}`;
  } else {
    eyebrow = `${goalName} · ${copy.steadyWeight}`;
  }

  const adjustLabel = breakdown.floorApplied
    ? breakdown.floorAtOrAboveMaintenance
      ? copy.rowFloorDifference
      : copy.rowFloorDeficit
    : goal === 'lose'
      ? copy.rowDeficit
      : goal === 'gain'
        ? copy.rowSurplus
        : copy.rowAdjustment;

  const rows: MathsRow[] = [
    {
      key: 'maintenance',
      label: copy.rowMaintenance,
      sub: copy.rowMaintenanceSub(
        formatInt(breakdown.bmr),
        breakdown.activityMultiplier,
        copy.activityLower[input.activityLevel],
      ),
      value: breakdown.maintenanceKcal,
    },
    { key: 'adjustment', label: adjustLabel, value: breakdown.adjustmentKcal, signed: true },
  ];
  if (final.isCustom) {
    rows.push({
      key: 'custom',
      label: copy.rowCustom,
      sub: copy.rowCustomSub(formatInt(breakdown.calculatedKcal)),
      value: final.kcal - breakdown.calculatedKcal,
      signed: true,
    });
  }
  rows.push({
    key: 'total',
    label: copy.rowTotal,
    ...(breakdown.roundingChanged ? { sub: copy.rowRounded } : {}),
    value: final.kcal,
    total: true,
  });

  return {
    input,
    goalOption,
    breakdown,
    final,
    rateKg,
    paceOption,
    paceBand: paceOption === null ? null : paceBandFor(rateKg),
    eyebrow,
    floorNotice,
    isCustom: final.isCustom,
    rows,
  };
}

export interface PaceOptionModel {
  id: PaceId;
  kg: number;
  title: string;
  rate: string;
  kcalLine: string;
  /** The floor hint (C-p4) when this pace would hit the minimum for the user's stats. */
  hint?: string;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Daily kcal below or above maintenance for a pace, rounded for display. */
export function paceKcalLine(goal: 'lose' | 'gain', kg: number, step: number): string {
  const kcal = formatInt(roundTo((kg * KCAL_PER_KG) / 7, step));
  return goal === 'lose' ? copy.paceBelow(kcal) : copy.paceAbove(kcal);
}

/** Would this pace be raised to the calorie floor for the user's stats? Null while the stats are incomplete. */
function paceHitsFloor(d: TargetsDraft, goal: Goal, kg: number, now: Date): boolean | null {
  const about = validateAbout(d, now);
  if (!about.ok) return null;
  const input = baseInput(about.value, d, goal, kg);
  return input ? explainTargets(input, now).floorApplied : null;
}

export function paceOptions(
  d: TargetsDraft,
  goal: 'lose' | 'gain',
  now: Date = new Date(),
): PaceOptionModel[] {
  const floorText = (() => {
    const about = validateAbout(d, now);
    return about.ok ? formatInt(about.value.sex === 'male' ? 1500 : 1200) : null;
  })();
  return PACE_PRESETS[goal][d.units].map((p) => {
    const hits = paceHitsFloor(d, goal, p.kg, now);
    return {
      id: p.id,
      kg: p.kg,
      title: copy.paceNames[p.id],
      rate: copy.paceRate(presetRateText(p.kg, d.units), d.units),
      kcalLine: paceKcalLine(goal, p.kg, 25),
      ...(hits && floorText ? { hint: copy.paceFloorHint(floorText) } : {}),
    };
  });
}

/** The live line and floor hint for a valid custom pace. */
export function customPaceInfo(
  d: TargetsDraft,
  goal: 'lose' | 'gain',
  kg: number,
  now: Date = new Date(),
): { kcalLine: string; hint?: string } {
  const hits = paceHitsFloor(d, goal, kg, now);
  const about = validateAbout(d, now);
  const floor = about.ok ? formatInt(about.value.sex === 'male' ? 1500 : 1200) : null;
  return {
    kcalLine: paceKcalLine(goal, kg, 5),
    ...(hits && floor ? { hint: copy.paceFloorHint(floor) } : {}),
  };
}

/** The recommended maximum as shown to the user ("0.75 kg" or "1.65 lb"). */
export function recommendedLimitText(units: UnitSystem): string {
  return units === 'metric'
    ? `${RECOMMENDED_MAX_WEEKLY_RATE_KG} kg`
    : `${round(kgToLb(RECOMMENDED_MAX_WEEKLY_RATE_KG), 2)} lb`;
}

// ---------------------------------------------------------------------------------------------
// Summaries for list rows (Adjust and Edit sheets)
// ---------------------------------------------------------------------------------------------

export function goalSummary(d: TargetsDraft, now: Date = new Date()): string | null {
  const g = effectiveGoalOption(d, now);
  return g ? sentence(copy.goalCards[g].title) : null;
}

export function paceSummary(d: TargetsDraft): string {
  const goalOption = d.goalOption;
  if (!goalOption || d.pace === null) return '';
  const goal = GOAL_FOR_OPTION[goalOption];
  if (goal === 'maintain') return '';
  const rateKg = chosenRateKg(d, goal);
  if (d.pace.kind === 'custom') {
    const unit = d.units === 'metric' ? 'kg' : 'lb';
    const shown = rateKg !== null ? oneOrTwoDecimals(rateToDisplay(rateKg, d.units)) : d.pace.text;
    return `${sentence(copy.paceCustomTitle)} · ${shown} ${unit} a week`;
  }
  const kg = presetKg(goal, d.units, d.pace.id);
  return `${sentence(copy.paceNames[d.pace.id])} · ${copy.paceRate(kg !== null ? presetRateText(kg, d.units) : '', d.units)}`;
}

export function aboutSummary(d: TargetsDraft): string {
  const sexLabel = d.sex ? copy.labels[d.sex] : '';
  const height =
    d.units === 'metric'
      ? d.heightCm && `${d.heightCm} cm`
      : (d.heightFt || d.heightIn) && `${d.heightFt || '0'} ft ${d.heightIn || '0'} in`;
  const weight = d.weight && `${d.weight} ${d.units === 'metric' ? 'kg' : 'lb'}`;
  return [sexLabel, d.birthYear, height, weight].filter(Boolean).join(' · ');
}

export function activitySummary(d: TargetsDraft): string {
  return d.activity ? copy.activityShort[d.activity] : '';
}

/** Which kinds of change a sheet's working copy made relative to its seed (analytics `changed`). */
export function changedKinds(
  seed: TargetsDraft,
  next: TargetsDraft,
  seedKcalCustom: number | null,
): ('goal' | 'pace' | 'activity' | 'stats' | 'units' | 'manual_calories')[] {
  const out: ('goal' | 'pace' | 'activity' | 'stats' | 'units' | 'manual_calories')[] = [];
  if (seed.goalOption !== next.goalOption) out.push('goal');
  if (JSON.stringify(seed.pace) !== JSON.stringify(next.pace)) out.push('pace');
  if (seed.activity !== next.activity) out.push('activity');
  if (
    seed.sex !== next.sex ||
    seed.birthYear !== next.birthYear ||
    seed.heightCm !== next.heightCm ||
    seed.heightFt !== next.heightFt ||
    seed.heightIn !== next.heightIn ||
    seed.weight !== next.weight
  ) {
    out.push('stats');
  }
  if (seed.units !== next.units) out.push('units');
  if (next.customKcal !== null && next.customKcal !== seedKcalCustom) out.push('manual_calories');
  return out;
}
