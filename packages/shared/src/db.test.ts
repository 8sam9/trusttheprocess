import { describe, expect, it } from 'vitest';
import { DailyTargetsRow, ProfileRowSchema, ProfileUpdate } from './db';

describe('ProfileUpdate', () => {
  it('accepts a partial update', () => {
    expect(ProfileUpdate.parse({ display_name: '  Sam ' })).toEqual({ display_name: 'Sam' });
  });
  it('allows only display_name, units and timezone', () => {
    const parsed = ProfileUpdate.parse({
      units: 'imperial',
      timezone: 'Europe/Rome',
      user_id: 'x',
      health_data_consent_at: 'now',
      height_cm: 170,
      sex: 'male',
      birth_year: 1990,
      goal: 'lose',
      weekly_rate_kg: 0.5,
      activity_level: 'light',
      onboarding_completed_at: 'now',
    });
    expect(parsed).toEqual({ units: 'imperial', timezone: 'Europe/Rome' });
  });
  it('rejects out-of-range values', () => {
    expect(ProfileUpdate.safeParse({ display_name: '' }).success).toBe(false);
    expect(ProfileUpdate.safeParse({ timezone: '' }).success).toBe(false);
    expect(ProfileUpdate.safeParse({ units: 'stone' }).success).toBe(false);
  });
});

describe('row schemas', () => {
  it('parses a legacy profile row with the new columns null', () => {
    const row = ProfileRowSchema.parse({
      user_id: 'u',
      display_name: null,
      sex: null,
      birth_year: null,
      height_cm: null,
      activity_level: null,
      goal: null,
      goal_option: null,
      weekly_rate_kg: null,
      weight_kg: null,
      weight_recorded_on: null,
      units: 'metric',
      timezone: 'UTC',
      health_data_consent_at: null,
      onboarding_completed_at: null,
      created_at: '2026-10-19T08:00:00+00:00',
      updated_at: '2026-10-19T08:00:00+00:00',
    });
    expect(row.goal_option).toBeNull();
  });
  it('rejects a daily_targets row with a rate above 1.5', () => {
    const r = DailyTargetsRow.safeParse({ weekly_rate_kg: 1.6 });
    expect(r.success).toBe(false);
  });
});
