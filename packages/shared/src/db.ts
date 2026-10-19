import { z } from 'zod';
import { ActivityLevel, BiologicalSex, Goal, UnitSystem } from './profile';

/**
 * Row shape of public.profiles (supabase/migrations/20261019000000_profiles.sql).
 * Hand-written for Milestone 0; replace with generated types via `pnpm db:types` once Supabase runs locally.
 */
export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  sex: BiologicalSex | null;
  birth_year: number | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  weekly_rate_kg: number | null;
  units: UnitSystem;
  timezone: string;
  health_data_consent_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const currentYear = new Date().getUTCFullYear();

/** Columns a user may edit (mirrors the column-level UPDATE grant in the migration). */
export const ProfileUpdate = z
  .object({
    display_name: z.string().trim().min(1).max(50).nullable(),
    sex: BiologicalSex.nullable(),
    birth_year: z
      .number()
      .int()
      .min(currentYear - 110)
      .max(currentYear - 16)
      .nullable(),
    height_cm: z.number().min(100).max(250).nullable(),
    activity_level: ActivityLevel.nullable(),
    goal: Goal.nullable(),
    weekly_rate_kg: z.number().min(0).max(1).nullable(),
    units: UnitSystem,
    timezone: z.string().min(1).max(64),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
