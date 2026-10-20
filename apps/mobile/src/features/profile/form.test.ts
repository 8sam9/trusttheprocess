import { ProfileUpdate, type ProfileRow } from '@ttp/shared';
import { formFromRow, updateFromForm } from './form';

const row: ProfileRow = {
  user_id: 'u1',
  display_name: 'Sam',
  sex: 'male',
  birth_year: 1989,
  height_cm: 180,
  activity_level: 'moderate',
  goal: null,
  goal_option: null,
  weekly_rate_kg: null,
  weight_kg: null,
  weight_recorded_on: null,
  units: 'metric',
  timezone: 'Europe/Rome',
  health_data_consent_at: null,
  onboarding_completed_at: null,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
};

describe('profile form', () => {
  it('builds a direct update with only name, units and timezone', () => {
    const update = updateFromForm(formFromRow(row), 'Europe/Rome');
    expect(update).toEqual({ display_name: 'Sam', units: 'metric', timezone: 'Europe/Rome' });
    expect(ProfileUpdate.safeParse(update).success).toBe(true);
  });

  it('turns a blank name into null', () => {
    const update = updateFromForm({ ...formFromRow(row), displayName: '  ' }, 'UTC');
    expect(update.display_name).toBeNull();
  });

  it('shows imperial values from a metric row', () => {
    expect(formFromRow(row)).toMatchObject({ heightFt: '5', heightIn: '11' });
  });
});
