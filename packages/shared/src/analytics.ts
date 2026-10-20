import { z } from 'zod';
import { GoalOption } from './targets';
import { Goal, UnitSystem } from './profile';

/**
 * Analytics events (spec 001 section 5, CR-1). Every event is a strict object of enums, booleans and small
 * integers: no body stats, calorie or macro values, names, emails or free text. The standard anonymous user
 * id and platform are added by the analytics layer, not here.
 */
const Source = z.enum(['onboarding', 'settings']);

export const AnalyticsEvent = z.discriminatedUnion('name', [
  z.strictObject({
    name: z.literal('onboarding_started'),
    entry: z.enum(['first_run', 'resumed']),
  }),
  z.strictObject({
    name: z.literal('onboarding_step_viewed'),
    step: z.enum(['goal', 'consent', 'about_you', 'activity', 'pace', 'reveal']),
  }),
  z.strictObject({ name: z.literal('onboarding_goal_selected'), goal_option: GoalOption }),
  z.strictObject({
    name: z.literal('health_consent_decided'),
    decision: z.enum(['given', 'declined']),
    surface: Source,
  }),
  z.strictObject({
    name: z.literal('onboarding_blocked'),
    reason: z.enum(['under_min_age', 'low_bmi_guard']),
  }),
  z.strictObject({
    name: z.literal('targets_revealed'),
    goal: Goal,
    floor_applied: z.boolean(),
    units: UnitSystem,
    source: Source,
    /** Lose and gain only (CR-1). */
    pace_option: z.enum(['steady', 'moderate', 'faster', 'custom']).optional(),
    pace_band: z.enum(['le_0_75', 'gt_0_75']).optional(),
  }),
  z.strictObject({ name: z.literal('targets_adjust_opened'), source: Source }),
  z.strictObject({
    name: z.literal('targets_manual_override'),
    direction: z.enum(['up', 'down', 'blocked_by_floor']),
  }),
  z.strictObject({
    name: z.literal('onboarding_completed'),
    duration_bucket: z.enum(['lt_1m', '1_to_3m', 'gt_3m']),
    /** 0 to 5, where 5 means 5 or more. */
    back_count: z.int().min(0).max(5),
  }),
  z.strictObject({
    name: z.literal('targets_updated'),
    changed: z
      .array(z.enum(['goal', 'pace', 'activity', 'stats', 'units', 'manual_calories']))
      .min(1)
      .max(6),
    source: Source,
  }),
  z.strictObject({
    name: z.literal('onboarding_save_failed'),
    reason: z.enum(['offline', 'server', 'validation']),
    stage: z.enum(['consent', 'final_save']),
  }),
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;
export type AnalyticsEventName = AnalyticsEvent['name'];
