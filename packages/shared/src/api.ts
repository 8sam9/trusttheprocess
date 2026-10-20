import { z } from 'zod';
import { DailyTargetsRow, ProfileRowSchema } from './db';
import { CALORIE_FLOOR, KCAL_PER_GRAM, PROTEIN_MAX_KCAL_SHARE } from './nutrition';
import { ActivityLevel, BiologicalSex, UnitSystem, type ProfileInput } from './profile';
import {
  GOAL_FOR_OPTION,
  GoalOption,
  HEIGHT_CM,
  LOSE_GUARD_MIN_AGE,
  LOSE_GUARD_MIN_BMI,
  MACRO_KCAL_TOLERANCE,
  MANUAL_KCAL_MAX,
  MAX_AGE_YEARS,
  MAX_WEEKLY_RATE_KG,
  MIN_AGE_YEARS,
  MIN_WEEKLY_RATE_KG,
  TARGETS_FORMULA_VERSION,
  WEIGHT_KG,
  type FinalTargets,
  type TargetsBreakdown,
} from './targets';
import { round } from './units';

/** Error codes raised by the apply_targets RPC (RAISE EXCEPTION '<code>', SQLSTATE P0001). */
export const ApplyTargetsErrorCode = z.enum([
  'not_authenticated',
  'consent_required',
  'under_min_age',
  'invalid_input',
  'lose_goal_unavailable',
  'below_floor',
  'above_cap',
  'macro_mismatch',
]);
export type ApplyTargetsErrorCode = z.infer<typeof ApplyTargetsErrorCode>;

/** Sanity bounds also enforced by apply_targets (keep in sync with the migration). */
const BMR_RANGE = { min: 500, max: 5000 } as const;
const MAINTENANCE_MIN_FACTOR = 1.2;
const KCAL_DB_MAX = 12000;

/**
 * Returns tz when this runtime's Intl accepts it, else 'UTC'. Use it when reading the device zone so a
 * runtime-specific name never reaches the server; the server itself never rewrites a zone. Postgres accepts
 * IANA links (e.g. Europe/Kyiv, America/Nuuk).
 */
export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isKnownTimeZone(tz) ? tz : 'UTC';
}

function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Arguments of public.apply_targets(). The superRefine applies the same rules, in the same order, as the RPC.
 * Each rule failure adds exactly one issue whose `message` is the RPC error code, then stops, so the first
 * issue's message is the code the server would raise. (consent_required is server-state dependent and
 * can't be checked here.) The age rule uses the current UTC year, like ageInYears() and the RPC.
 */
export const ApplyTargetsArgs = z
  .strictObject({
    p_give_consent: z.boolean(),
    p_goal_option: GoalOption,
    p_sex: BiologicalSex,
    p_birth_year: z.int(),
    p_height_cm: z.number(),
    p_weight_kg: z.number(),
    p_activity_level: ActivityLevel,
    p_weekly_rate_kg: z.number(),
    p_units: UnitSystem,
    p_timezone: z.string(),
    p_kcal: z.int(),
    p_protein_g: z.int(),
    p_carbs_g: z.int(),
    p_fat_g: z.int(),
    p_calculated_kcal: z.int(),
    p_floor_applied: z.boolean(),
    p_bmr: z.int(),
    p_maintenance_kcal: z.int(),
    p_formula_version: z.string(),
  })
  .superRefine((a, ctx) => {
    const fail = (code: ApplyTargetsErrorCode, path: string) =>
      ctx.addIssue({ code: 'custom', message: code, path: [path] });

    if (
      a.p_formula_version.length < 1 ||
      a.p_formula_version.length > 32 ||
      a.p_timezone.length < 1 ||
      a.p_timezone.length > 64
    ) {
      return fail('invalid_input', 'p_formula_version');
    }
    if (!isKnownTimeZone(a.p_timezone)) return fail('invalid_input', 'p_timezone');
    const age = new Date().getUTCFullYear() - a.p_birth_year;
    if (age < MIN_AGE_YEARS) return fail('under_min_age', 'p_birth_year');
    if (
      age > MAX_AGE_YEARS ||
      a.p_height_cm < HEIGHT_CM.min ||
      a.p_height_cm > HEIGHT_CM.max ||
      a.p_weight_kg < WEIGHT_KG.min ||
      a.p_weight_kg > WEIGHT_KG.max ||
      a.p_bmr < BMR_RANGE.min ||
      a.p_bmr > BMR_RANGE.max ||
      a.p_maintenance_kcal < a.p_bmr * MAINTENANCE_MIN_FACTOR - 1 ||
      a.p_maintenance_kcal > KCAL_DB_MAX ||
      a.p_calculated_kcal > KCAL_DB_MAX
    ) {
      return fail('invalid_input', age > MAX_AGE_YEARS ? 'p_birth_year' : 'p_height_cm');
    }
    const goal = GOAL_FOR_OPTION[a.p_goal_option];
    if (
      goal === 'maintain'
        ? a.p_weekly_rate_kg !== 0
        : a.p_weekly_rate_kg < MIN_WEEKLY_RATE_KG || a.p_weekly_rate_kg > MAX_WEEKLY_RATE_KG
    ) {
      return fail('invalid_input', 'p_weekly_rate_kg');
    }
    const heightM = a.p_height_cm / 100;
    if (
      goal === 'lose' &&
      (age < LOSE_GUARD_MIN_AGE || a.p_weight_kg / (heightM * heightM) < LOSE_GUARD_MIN_BMI)
    ) {
      return fail('lose_goal_unavailable', 'p_goal_option');
    }
    const floor = CALORIE_FLOOR[a.p_sex];
    if (a.p_kcal < floor || a.p_calculated_kcal < floor) return fail('below_floor', 'p_kcal');
    if (a.p_floor_applied && a.p_calculated_kcal !== floor)
      return fail('invalid_input', 'p_floor_applied');
    if (
      a.p_kcal !== a.p_calculated_kcal &&
      a.p_kcal > Math.max(MANUAL_KCAL_MAX, a.p_calculated_kcal)
    ) {
      return fail('above_cap', 'p_kcal');
    }
    if (a.p_protein_g < 0 || a.p_carbs_g < 0 || a.p_fat_g < 0)
      return fail('macro_mismatch', 'p_protein_g');
    const macroKcal =
      KCAL_PER_GRAM.protein * a.p_protein_g +
      KCAL_PER_GRAM.carbs * a.p_carbs_g +
      KCAL_PER_GRAM.fat * a.p_fat_g;
    if (
      Math.abs(macroKcal - a.p_kcal) > MACRO_KCAL_TOLERANCE ||
      KCAL_PER_GRAM.protein * a.p_protein_g > a.p_kcal * PROTEIN_MAX_KCAL_SHARE + 2
    ) {
      return fail('macro_mismatch', 'p_protein_g');
    }
  });
export type ApplyTargetsArgs = z.infer<typeof ApplyTargetsArgs>;

/** Returned by apply_targets(): the updated profile row and the targets row now in effect. */
export const ApplyTargetsResult = z.object({
  profile: ProfileRowSchema,
  targets: DailyTargetsRow,
});
export type ApplyTargetsResult = z.infer<typeof ApplyTargetsResult>;

/**
 * Builds the RPC arguments from a validated ProfileInput plus the computed breakdown and final targets.
 * Pure and does not validate: run ApplyTargetsArgs.safeParse on the result before sending.
 * Rounds to the column precision (height 1 dp, weight 2 dp, rate 2 dp).
 */
export function buildApplyTargetsArgs(params: {
  input: ProfileInput;
  goalOption: GoalOption;
  timezone: string;
  giveConsent: boolean;
  breakdown: TargetsBreakdown;
  final: FinalTargets;
}): ApplyTargetsArgs {
  const { input, goalOption, timezone, giveConsent, breakdown, final } = params;
  if (GOAL_FOR_OPTION[goalOption] !== input.goal) {
    throw new Error('buildApplyTargetsArgs: goalOption does not match input.goal');
  }
  return {
    p_give_consent: giveConsent,
    p_goal_option: goalOption,
    p_sex: input.sex,
    p_birth_year: input.birthYear,
    p_height_cm: round(input.heightCm, 1),
    p_weight_kg: round(input.weightKg, 2),
    p_activity_level: input.activityLevel,
    p_weekly_rate_kg: round(input.weeklyRateKg, 2),
    p_units: input.units,
    p_timezone: timezone,
    p_kcal: final.kcal,
    p_protein_g: final.proteinG,
    p_carbs_g: final.carbsG,
    p_fat_g: final.fatG,
    p_calculated_kcal: breakdown.calculatedKcal,
    p_floor_applied: breakdown.floorApplied,
    p_bmr: breakdown.bmr,
    p_maintenance_kcal: breakdown.maintenanceKcal,
    p_formula_version: TARGETS_FORMULA_VERSION,
  };
}

/** Per-user value persisted on the device so a completed user reaches Today offline. No body stats. */
export const CachedGate = z.object({
  v: z.literal(1),
  onboardingCompleted: z.boolean(),
  targets: z
    .object({
      effective_from: z.iso.date(),
      kcal: z.number().int(),
      protein_g: z.number().int(),
      carbs_g: z.number().int(),
      fat_g: z.number().int(),
      is_custom: z.boolean(),
      floor_applied: z.boolean(),
    })
    .nullable(),
  cachedAt: z.iso.datetime(),
});
export type CachedGate = z.infer<typeof CachedGate>;
