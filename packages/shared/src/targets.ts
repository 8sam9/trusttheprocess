import { z } from 'zod';
import {
  CALORIE_FLOOR,
  KCAL_PER_KG,
  ageInYears,
  bmrMifflinStJeor,
  dailyEnergyDelta,
  macroTargets,
  tdee,
  ACTIVITY_MULTIPLIER,
  KCAL_PER_GRAM,
  PROTEIN_MAX_KCAL_SHARE,
} from './nutrition';
import type { BiologicalSex, Goal, ProfileInput, UnitSystem } from './profile';
import { round } from './units';

// ---------------------------------------------------------------------------------------------
// Constants. The SQL in apply_targets() mirrors these; the parity fixture keeps them in step.
// PROTEIN_MAX_KCAL_SHARE lives in nutrition.ts (macroTargets uses it) and is exported from the index.
// ---------------------------------------------------------------------------------------------
export const MIN_AGE_YEARS = 16;
export const MAX_AGE_YEARS = 110;
/** Lose fat is not offered below this age (ages 16 and 17). */
export const LOSE_GUARD_MIN_AGE = 18;
/** Lose fat is not offered below this BMI. The value itself is never shown or returned. */
export const LOSE_GUARD_MIN_BMI = 18.5;
export const HEIGHT_CM = { min: 100, max: 250 } as const;
export const WEIGHT_KG = { min: 30, max: 350 } as const;
export const MIN_WEEKLY_RATE_KG = 0.01;
export const MAX_WEEKLY_RATE_KG = 1.5;
export const RECOMMENDED_MAX_WEEKLY_RATE_KG = 0.75;
export const MANUAL_KCAL_MAX = 6000;
export const MANUAL_KCAL_STEP = 50;
export const MACRO_KCAL_TOLERANCE = 10;
export const TARGETS_FORMULA_VERSION = 'msj-1';
export const DEFAULT_WEEKLY_RATE_KG = { lose: 0.5, gain: 0.25 } as const;

export interface PacePreset {
  id: 'steady' | 'moderate' | 'faster';
  kg: number;
}
/** Preset paces per goal and unit system. Imperial presets are 0.5 / 1 / 1.5 lb a week converted to kg (2 dp). */
export const PACE_PRESETS: Record<'lose' | 'gain', Record<UnitSystem, readonly PacePreset[]>> = {
  lose: {
    metric: [
      { id: 'steady', kg: 0.25 },
      { id: 'moderate', kg: 0.5 },
      { id: 'faster', kg: 0.75 },
    ],
    imperial: [
      { id: 'steady', kg: 0.23 },
      { id: 'moderate', kg: 0.45 },
      { id: 'faster', kg: 0.68 },
    ],
  },
  gain: {
    metric: [
      { id: 'steady', kg: 0.25 },
      { id: 'moderate', kg: 0.5 },
    ],
    imperial: [
      { id: 'steady', kg: 0.23 },
      { id: 'moderate', kg: 0.45 },
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------------------------
export const GoalOption = z.enum(['lose_fat', 'build_muscle', 'fuel_performance', 'just_track']);
export type GoalOption = z.infer<typeof GoalOption>;

export const GOAL_FOR_OPTION: Record<GoalOption, Goal> = {
  lose_fat: 'lose',
  build_muscle: 'gain',
  fuel_performance: 'maintain',
  just_track: 'maintain',
};

export interface TargetsBreakdown {
  /** Rounded to whole kcal. */
  bmr: number;
  activityMultiplier: number;
  /** Rounded to whole kcal. */
  maintenanceKcal: number;
  /**
   * Signed goal delta shown in the maths panel. Normally round(raw) - maintenance (for example -550).
   * When the floor applied it is calculatedKcal - maintenanceKcal (for example -129).
   * maintenanceKcal + adjustmentKcal is always within 5 kcal of calculatedKcal.
   */
  adjustmentKcal: number;
  /** Maintenance plus the goal delta, before the floor and before rounding to 10, rounded to whole kcal. */
  rawKcal: number;
  /** Final calculated target: floor applied, rounded to the nearest 10. */
  calculatedKcal: number;
  /** True when calculatedKcal differs from maintenanceKcal + adjustmentKcal (rounding to 10 changed it). */
  roundingChanged: boolean;
  floorKcal: number;
  floorApplied: boolean;
  /** True when floorApplied and the floor is at or above maintenance (no deficit is possible). */
  floorAtOrAboveMaintenance: boolean;
  /**
   * Only when floorApplied: the pace the floor actually implies, in kg per week (unrounded; may be <= 0
   * when the floor is at or above maintenance). For lose it is a loss rate, otherwise a gain rate.
   */
  impliedWeeklyRateKg: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FinalTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isCustom: boolean;
  proteinCapped: boolean;
  clamped: 'floor' | 'max' | null;
}

// ---------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------

/** Valid birth-year range for the given moment (same calendar-year rule as ageInYears, UTC). */
export function birthYearRange(today: Date = new Date()): { min: number; max: number } {
  const year = today.getUTCFullYear();
  return { min: year - MAX_AGE_YEARS, max: year - MIN_AGE_YEARS };
}

/** Computes the calculated targets and every number the "how we got here" panel needs. */
export function explainTargets(input: ProfileInput, today: Date = new Date()): TargetsBreakdown {
  const bmrExact = bmrMifflinStJeor({
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age: ageInYears(input.birthYear, today),
  });
  const maintenanceExact = tdee(bmrExact, input.activityLevel);
  const rawExact = maintenanceExact + dailyEnergyDelta(input.goal, input.weeklyRateKg);
  const floorKcal = CALORIE_FLOOR[input.sex];
  const floorApplied = rawExact < floorKcal;

  const maintenanceKcal = round(maintenanceExact);
  const rawKcal = round(rawExact);
  const calculatedKcal = round(Math.max(rawExact, floorKcal) / 10) * 10;
  const adjustmentKcal = floorApplied
    ? calculatedKcal - maintenanceKcal
    : rawKcal - maintenanceKcal;

  let impliedWeeklyRateKg: number | null = null;
  if (floorApplied) {
    const dailyDelta =
      input.goal === 'lose' ? maintenanceExact - floorKcal : floorKcal - maintenanceExact;
    impliedWeeklyRateKg = (dailyDelta * 7) / KCAL_PER_KG;
  }

  const macros = macroTargets(calculatedKcal, input.weightKg, input.goal);
  return {
    bmr: round(bmrExact),
    activityMultiplier: ACTIVITY_MULTIPLIER[input.activityLevel],
    maintenanceKcal,
    adjustmentKcal,
    rawKcal,
    calculatedKcal,
    roundingChanged: calculatedKcal !== maintenanceKcal + adjustmentKcal,
    floorKcal,
    floorApplied,
    floorAtOrAboveMaintenance: floorApplied && floorKcal >= maintenanceExact,
    impliedWeeklyRateKg,
    ...macros,
  };
}

/** Allowed range for a manual calorie edit: the sex floor up to max(6000, calculated). */
export function manualKcalBounds(
  sex: BiologicalSex,
  calculatedKcal: number,
): { min: number; max: number } {
  return { min: CALORIE_FLOOR[sex], max: Math.max(MANUAL_KCAL_MAX, calculatedKcal) };
}

/**
 * Applies a manual calorie value. The value is clamped into manualKcalBounds (and `clamped` says which side).
 * Protein is held at the computed value unless it would exceed the protein share cap; fat uses the default
 * split; carbs take the remainder (never negative).
 */
export function applyManualKcal(
  b: TargetsBreakdown,
  kcal: number,
  p: Pick<ProfileInput, 'sex' | 'weightKg' | 'goal'>,
): FinalTargets {
  const { min, max } = manualKcalBounds(p.sex, b.calculatedKcal);
  const rounded = Math.round(kcal);
  const clamped: FinalTargets['clamped'] = rounded < min ? 'floor' : rounded > max ? 'max' : null;
  const target = Math.min(Math.max(rounded, min), max);

  if (target === b.calculatedKcal) {
    return {
      kcal: target,
      proteinG: b.proteinG,
      carbsG: b.carbsG,
      fatG: b.fatG,
      isCustom: false,
      proteinCapped: false,
      clamped,
    };
  }

  const proteinCapG = round((target * PROTEIN_MAX_KCAL_SHARE) / KCAL_PER_GRAM.protein);
  const proteinG = Math.min(b.proteinG, proteinCapG);
  const fatG = macroTargets(target, p.weightKg, p.goal).fatG;
  const carbsG = Math.max(
    0,
    round(
      (target - proteinG * KCAL_PER_GRAM.protein - fatG * KCAL_PER_GRAM.fat) / KCAL_PER_GRAM.carbs,
    ),
  );
  return {
    kcal: target,
    proteinG,
    carbsG,
    fatG,
    isCustom: true,
    proteinCapped: proteinG < b.proteinG,
    clamped,
  };
}

/**
 * True when Lose fat must not be offered: age under 18, or BMI under 18.5.
 * The BMI is computed internally and never returned or logged.
 */
export function isLoseGoalGuarded(
  p: { birthYear: number; heightCm: number; weightKg: number },
  today: Date = new Date(),
): boolean {
  if (ageInYears(p.birthYear, today) < LOSE_GUARD_MIN_AGE) return true;
  const heightM = p.heightCm / 100;
  return p.weightKg / (heightM * heightM) < LOSE_GUARD_MIN_BMI;
}

const IMPERIAL_REGIONS: ReadonlySet<string> = new Set(['US', 'LR', 'MM']);

/** Default unit system from a device region code (US, Liberia, Myanmar use imperial). */
export function defaultUnitsForRegion(region: string | null | undefined): UnitSystem {
  return region != null && IMPERIAL_REGIONS.has(region.toUpperCase()) ? 'imperial' : 'metric';
}

/**
 * The user-local calendar date (YYYY-MM-DD) at `now` in an IANA time zone.
 * An unknown zone falls back to UTC rather than throwing, so the UI never crashes on odd devices.
 */
export function localDateIn(timeZone: string, now: Date = new Date()): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone);
  } catch {
    parts = fmt('UTC');
  }
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((x) => x.type === type)?.value ?? '';
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}

/** The target in effect on `date` (YYYY-MM-DD): the row with the greatest effective_from <= date, or null. */
export function targetForDate<T extends { effective_from: string }>(
  rows: readonly T[],
  date: string,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.effective_from <= date && (best === null || row.effective_from > best.effective_from)) {
      best = row;
    }
  }
  return best;
}
