import { describe, expect, it } from 'vitest';
import { AnalyticsEvent } from './analytics';

const valid = [
  { name: 'onboarding_started', entry: 'first_run' },
  { name: 'onboarding_step_viewed', step: 'reveal' },
  { name: 'onboarding_goal_selected', goal_option: 'just_track' },
  { name: 'health_consent_decided', decision: 'given', surface: 'onboarding' },
  { name: 'onboarding_blocked', reason: 'low_bmi_guard' },
  {
    name: 'targets_revealed',
    goal: 'lose',
    floor_applied: true,
    units: 'metric',
    source: 'onboarding',
    pace_option: 'custom',
    pace_band: 'gt_0_75',
  },
  {
    name: 'targets_revealed',
    goal: 'maintain',
    floor_applied: false,
    units: 'imperial',
    source: 'settings',
  },
  { name: 'targets_adjust_opened', source: 'settings' },
  { name: 'targets_manual_override', direction: 'blocked_by_floor' },
  { name: 'onboarding_completed', duration_bucket: '1_to_3m', back_count: 5 },
  { name: 'targets_updated', changed: ['goal', 'manual_calories'], source: 'settings' },
  { name: 'onboarding_save_failed', reason: 'offline', stage: 'final_save' },
] as const;

describe('AnalyticsEvent (AC 32)', () => {
  it('accepts every event from the spec', () => {
    for (const e of valid) expect(AnalyticsEvent.safeParse(e).success, e.name).toBe(true);
  });
  it('rejects extra keys such as body values, names or emails', () => {
    for (const e of valid) {
      for (const extra of [
        { weight_kg: 65 },
        { kcal: 1330 },
        { email: 'a@b.c' },
        { birth_year: 1996 },
      ]) {
        expect(AnalyticsEvent.safeParse({ ...e, ...extra }).success).toBe(false);
      }
    }
  });
  it('rejects numeric or free-text values for enum properties', () => {
    expect(
      AnalyticsEvent.safeParse({
        name: 'targets_revealed',
        goal: 'lose',
        floor_applied: true,
        units: 'metric',
        source: 'onboarding',
        pace_option: 0.5,
      }).success,
    ).toBe(false);
    expect(
      AnalyticsEvent.safeParse({ name: 'onboarding_goal_selected', goal_option: 'Lose 5kg' })
        .success,
    ).toBe(false);
    expect(
      AnalyticsEvent.safeParse({
        name: 'onboarding_completed',
        duration_bucket: 'lt_1m',
        back_count: 6,
      }).success,
    ).toBe(false);
    expect(
      AnalyticsEvent.safeParse({
        name: 'onboarding_completed',
        duration_bucket: 'lt_1m',
        back_count: 1.5,
      }).success,
    ).toBe(false);
    expect(
      AnalyticsEvent.safeParse({ name: 'targets_updated', changed: [], source: 'settings' })
        .success,
    ).toBe(false);
    expect(AnalyticsEvent.safeParse({ name: 'unknown_event' }).success).toBe(false);
  });
});
