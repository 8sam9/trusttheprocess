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
  weekly_rate_kg: null,
  units: 'metric',
  timezone: 'Europe/Rome',
  health_data_consent_at: null,
  onboarding_completed_at: null,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
};

describe('profile form', () => {
  it('round-trips a metric profile', () => {
    const update = updateFromForm(formFromRow(row), 'Europe/Rome');
    expect(update).toMatchObject({
      display_name: 'Sam',
      height_cm: 180,
      birth_year: 1989,
      units: 'metric',
    });
    expect(ProfileUpdate.safeParse(update).success).toBe(true);
  });

  it('converts imperial height to centimetres', () => {
    const form = { ...formFromRow(row), units: 'imperial' as const, heightFt: '6', heightIn: '0' };
    expect(updateFromForm(form, 'UTC').height_cm).toBe(182.9);
  });

  it('accepts a decimal comma and turns blanks into null', () => {
    const form = { ...formFromRow(row), heightCm: '175,5', birthYear: '', displayName: '  ' };
    const update = updateFromForm(form, 'UTC');
    expect(update.height_cm).toBe(175.5);
    expect(update.birth_year).toBeNull();
    expect(update.display_name).toBeNull();
  });

  it('shows imperial values from a metric row', () => {
    expect(formFromRow(row)).toMatchObject({ heightFt: '5', heightIn: '11' });
  });
});
