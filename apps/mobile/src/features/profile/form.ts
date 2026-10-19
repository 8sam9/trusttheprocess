import {
  cmToFtIn,
  ftInToCm,
  round,
  type ProfileRow,
  type ProfileUpdate,
  type UnitSystem,
} from '@ttp/shared';

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

const toNumber = (s: string): number | null => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};

/** Converts the form into a metric ProfileUpdate. Empty fields become null. */
export function updateFromForm(f: ProfileForm, timezone: string): ProfileUpdate {
  let heightCm: number | null;
  if (f.units === 'imperial') {
    const ft = toNumber(f.heightFt);
    const inches = toNumber(f.heightIn) ?? 0;
    heightCm = ft == null ? null : round(ftInToCm(ft, inches), 1);
  } else {
    const cm = toNumber(f.heightCm);
    heightCm = cm == null ? null : round(cm, 1);
  }
  const birthYear = toNumber(f.birthYear);
  return {
    display_name: f.displayName.trim() === '' ? null : f.displayName.trim(),
    units: f.units,
    sex: f.sex,
    birth_year: birthYear == null ? null : Math.trunc(birthYear),
    height_cm: heightCm,
    activity_level: f.activityLevel,
    timezone,
  };
}
