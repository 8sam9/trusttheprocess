import { z } from 'zod';
import {
  HEIGHT_CM,
  MAX_AGE_YEARS,
  MAX_WEEKLY_RATE_KG,
  MIN_AGE_YEARS,
  MIN_WEEKLY_RATE_KG,
  WEIGHT_KG,
  birthYearRange,
} from './targets';

/** Sex used only for the BMR equation. "unspecified" averages the two constants. */
export const BiologicalSex = z.enum(['female', 'male', 'unspecified']);
export type BiologicalSex = z.infer<typeof BiologicalSex>;

export const ActivityLevel = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const Goal = z.enum(['lose', 'maintain', 'gain']);
export type Goal = z.infer<typeof Goal>;

export const UnitSystem = z.enum(['metric', 'imperial']);
export type UnitSystem = z.infer<typeof UnitSystem>;

export const ProfileInput = z
  .object({
    sex: BiologicalSex,
    // Bounds are evaluated at parse time (not module load) so they do not go stale across New Year.
    birthYear: z
      .number()
      .int()
      .refine(
        (y) => {
          const { min, max } = birthYearRange();
          return y >= min && y <= max;
        },
        { message: `birthYear must make the user ${MIN_AGE_YEARS} to ${MAX_AGE_YEARS} years old` },
      ),
    heightCm: z.number().min(HEIGHT_CM.min).max(HEIGHT_CM.max),
    weightKg: z.number().min(WEIGHT_KG.min).max(WEIGHT_KG.max),
    activityLevel: ActivityLevel,
    goal: Goal,
    /** kg per week; 0 when goal = maintain, otherwise MIN_WEEKLY_RATE_KG to MAX_WEEKLY_RATE_KG. */
    weeklyRateKg: z.number().min(0).max(MAX_WEEKLY_RATE_KG),
    units: UnitSystem.default('metric'),
  })
  .refine(
    (p) =>
      p.goal === 'maintain'
        ? p.weeklyRateKg === 0
        : p.weeklyRateKg >= MIN_WEEKLY_RATE_KG && p.weeklyRateKg <= MAX_WEEKLY_RATE_KG,
    {
      message: `weeklyRateKg must be 0 for maintain and ${MIN_WEEKLY_RATE_KG} to ${MAX_WEEKLY_RATE_KG} otherwise`,
      path: ['weeklyRateKg'],
    },
  );
export type ProfileInput = z.infer<typeof ProfileInput>;
