import { z } from 'zod';

/** Sex used only for the BMR equation. "unspecified" averages the two constants. */
export const BiologicalSex = z.enum(['female', 'male', 'unspecified']);
export type BiologicalSex = z.infer<typeof BiologicalSex>;

export const ActivityLevel = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const Goal = z.enum(['lose', 'maintain', 'gain']);
export type Goal = z.infer<typeof Goal>;

export const UnitSystem = z.enum(['metric', 'imperial']);
export type UnitSystem = z.infer<typeof UnitSystem>;

const currentYear = new Date().getUTCFullYear();

export const ProfileInput = z
  .object({
    sex: BiologicalSex,
    birthYear: z
      .number()
      .int()
      .min(currentYear - 110)
      .max(currentYear - 16),
    heightCm: z.number().min(100).max(250),
    weightKg: z.number().min(30).max(350),
    activityLevel: ActivityLevel,
    goal: Goal,
    /** kg per week; 0 when goal = maintain. */
    weeklyRateKg: z.number().min(0).max(1),
    units: UnitSystem.default('metric'),
  })
  .refine((p) => (p.goal === 'maintain' ? p.weeklyRateKg === 0 : p.weeklyRateKg > 0), {
    message: 'weeklyRateKg must be 0 for maintain and > 0 otherwise',
    path: ['weeklyRateKg'],
  });
export type ProfileInput = z.infer<typeof ProfileInput>;
