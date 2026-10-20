import { cmToFtIn, type ProfileRow, type ProfileUpdate, type UnitSystem } from '@ttp/shared';

/** Form state keeps raw strings so users can type freely; conversion happens on save. */
export interface ProfileForm {
  displayName: string;
  units: UnitSystem;
  sex: ProfileRow['sex'];
  birthYear: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  activityLevel: ProfileRow['activity_level'];
}

export function formFromRow(row: ProfileRow): ProfileForm {
  const ftIn = row.height_cm != null ? cmToFtIn(row.height_cm) : null;
  return {
    displayName: row.display_name ?? '',
    units: row.units,
    sex: row.sex,
    birthYear: row.birth_year?.toString() ?? '',
    heightCm: row.height_cm?.toString() ?? '',
    heightFt: ftIn ? String(ftIn.ft) : '',
    heightIn: ftIn ? String(ftIn.in) : '',
    activityLevel: row.activity_level,
  };
}

/**
 * Builds the direct profile update. Since the onboarding migration only display_name, units and timezone
 * can be written directly; body stats go through apply_targets (spec 001, M7/M8 replace this form).
 */
export function updateFromForm(f: ProfileForm, timezone: string): ProfileUpdate {
  return {
    display_name: f.displayName.trim() === '' ? null : f.displayName.trim(),
    units: f.units,
    timezone,
  };
}
