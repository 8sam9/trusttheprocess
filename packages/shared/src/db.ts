import { z } from 'zod';
import { ActivityLevel, BiologicalSex, Goal, UnitSystem } from './profile';
import { GoalOption, MAX_WEEKLY_RATE_KG } from './targets';

/**
 * Row shape of public.profiles (migrations 20261019000000_profiles.sql and 20261020090000_onboarding_targets.sql).
 * Hand-written until `pnpm db:types` can run against a local stack.
 * Timestamps are plain strings: PostgREST returns offsets like "+00:00", which z.iso.datetime() rejects.
 */
export const ProfileRowSchema = z.object({
  user_id: z.string(),
  display_name: z.string().nullable(),
  sex: BiologicalSex.nullable(),
  birth_year: z.number().int().nullable(),
  height_cm: z.number().nullable(),
  activity_level: ActivityLevel.nullable(),
  goal: Goal.nullable(),
  goal_option: GoalOption.nullable(),
  weekly_rate_kg: z.number().nullable(),
  weight_kg: z.number().nullable(),
  /** User-local YYYY-MM-DD. */
  weight_recorded_on: z.string().nullable(),
  units: UnitSystem,
  timezone: z.string(),
  health_data_consent_at: z.string().nullable(),
  onboarding_completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProfileRow = z.infer<typeof ProfileRowSchema>;

/** Row shape of public.daily_targets (effective-dated targets, ADR 0004). Written only by apply_targets(). */
export const DailyTargetsRow = z.object({
  user_id: z.string(),
  /** User-local YYYY-MM-DD. */
  effective_from: z.iso.date(),
  kcal: z.number().int(),
  protein_g: z.number().int(),
  carbs_g: z.number().int(),
  fat_g: z.number().int(),
  calculated_kcal: z.number().int(),
  is_custom: z.boolean(),
  floor_applied: z.boolean(),
  bmr: z.number().int(),
  maintenance_kcal: z.number().int(),
  goal: Goal,
  goal_option: GoalOption,
  weekly_rate_kg: z.number().min(0).max(MAX_WEEKLY_RATE_KG),
  activity_level: ActivityLevel,
  formula_version: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DailyTargetsRow = z.infer<typeof DailyTargetsRow>;

/**
 * Columns a user may update directly (mirrors the column-level UPDATE grant after the onboarding migration).
 * Body stats, goal and onboarding_completed_at are written only through the apply_targets() RPC.
 */
export const ProfileUpdate = z
  .object({
    display_name: z.string().trim().min(1).max(50).nullable(),
    units: UnitSystem,
    timezone: z.string().min(1).max(64),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
