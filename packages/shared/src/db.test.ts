import { describe, expect, it } from 'vitest';
import { ProfileUpdate } from './db';

describe('ProfileUpdate', () => {
  it('accepts a partial update', () => {
    expect(ProfileUpdate.parse({ display_name: '  Sam ' })).toEqual({ display_name: 'Sam' });
  });
  it('rejects non-editable columns by stripping them', () => {
    const parsed = ProfileUpdate.parse({
      units: 'imperial',
      user_id: 'x',
      health_data_consent_at: 'now',
    });
    expect(parsed).toEqual({ units: 'imperial' });
  });
  it('rejects out-of-range values', () => {
    expect(ProfileUpdate.safeParse({ height_cm: 20 }).success).toBe(false);
    expect(ProfileUpdate.safeParse({ display_name: '' }).success).toBe(false);
  });
});
