import type { ProfileRow, ProfileUpdate, UnitSystem } from '@ttp/shared';

/**
 * Settings "Profile" form: only the name and the display units are edited directly (both autosave).
 * Body stats, goal and activity live in Daily targets and are saved through apply_targets (spec 001).
 */
export interface ProfileForm {
  displayName: string;
  units: UnitSystem;
}

export function formFromRow(row: ProfileRow): ProfileForm {
  return { displayName: row.display_name ?? '', units: row.units };
}

/** Direct profile update: display_name, units and timezone are the only columns users may write directly. */
export function updateFromForm(f: ProfileForm, timezone: string): ProfileUpdate {
  return {
    display_name: f.displayName.trim() === '' ? null : f.displayName.trim(),
    units: f.units,
    timezone,
  };
}
