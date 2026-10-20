import {
  HEIGHT_CM,
  MAX_AGE_YEARS,
  MAX_WEEKLY_RATE_KG,
  MIN_AGE_YEARS,
  MIN_WEEKLY_RATE_KG,
  WEIGHT_KG,
  ftInToCm,
  lbToKg,
  round,
  type BiologicalSex,
  type UnitSystem,
} from '@ttp/shared';
import { copy } from './copy';
import type { PaceChoice, TargetsDraft } from './draft';
import { parseDecimal, rateFromDisplay } from './units';

/** Imperial limits shown in the error copy: 3 ft 4 in to 8 ft 2 in, 67 to 771 lb. */
const IMPERIAL_HEIGHT_IN = { min: 40, max: 98 } as const;
const IMPERIAL_WEIGHT_LB = { min: 67, max: 771 } as const;

export type AboutField = 'sex' | 'birthYear' | 'height' | 'heightIn' | 'weight';
export type AboutErrors = Partial<Record<AboutField, string>>;

export interface AboutValues {
  sex: BiologicalSex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
}

export type AboutResult =
  | { ok: true; value: AboutValues }
  | { ok: false; underage: boolean; errors: AboutErrors; first: AboutField | null };

const FIELD_ORDER: AboutField[] = ['sex', 'birthYear', 'height', 'heightIn', 'weight'];

/** The current UTC calendar year, like the shared age rule (ageInYears) and the RPC. */
const utcYear = (now: Date) => now.getUTCFullYear();

export function validateBirthYear(
  text: string,
  now: Date = new Date(),
): { error: string | null; underage: boolean; year: number | null } {
  const t = text.trim();
  if (t === '') return { error: copy.errYearMissing, underage: false, year: null };
  const year = /^\d{4}$/.test(t) ? Number(t) : NaN;
  const current = utcYear(now);
  if (!Number.isFinite(year) || year > current) {
    return { error: copy.errYearMalformed, underage: false, year: null };
  }
  if (current - year < MIN_AGE_YEARS) return { error: null, underage: true, year };
  if (current - year > MAX_AGE_YEARS) {
    return { error: copy.errYearEarly(current - MAX_AGE_YEARS), underage: false, year: null };
  }
  return { error: null, underage: false, year };
}

export function validateHeight(
  d: Pick<TargetsDraft, 'units' | 'heightCm' | 'heightFt' | 'heightIn'>,
): { error: string | null; field: 'height' | 'heightIn'; cm: number | null } {
  if (d.units === 'metric') {
    if (d.heightCm.trim() === '')
      return { error: copy.errHeightMissing, field: 'height', cm: null };
    const cm = parseDecimal(d.heightCm);
    if (cm === null || cm < HEIGHT_CM.min || cm > HEIGHT_CM.max) {
      return { error: copy.errHeightMetric, field: 'height', cm: null };
    }
    return { error: null, field: 'height', cm: round(cm, 1) };
  }
  if (d.heightFt.trim() === '' && d.heightIn.trim() === '') {
    return { error: copy.errHeightMissing, field: 'height', cm: null };
  }
  const ft = d.heightFt.trim() === '' ? null : parseDecimal(d.heightFt);
  const inches = d.heightIn.trim() === '' ? 0 : parseDecimal(d.heightIn);
  if (inches === null || inches >= 12)
    return { error: copy.errInches, field: 'heightIn', cm: null };
  if (ft === null) return { error: copy.errHeightImperial, field: 'height', cm: null };
  const total = ft * 12 + inches;
  if (total < IMPERIAL_HEIGHT_IN.min || total > IMPERIAL_HEIGHT_IN.max) {
    return { error: copy.errHeightImperial, field: 'height', cm: null };
  }
  return { error: null, field: 'height', cm: round(ftInToCm(ft, inches), 1) };
}

export function validateWeight(d: Pick<TargetsDraft, 'units' | 'weight'>): {
  error: string | null;
  kg: number | null;
} {
  if (d.weight.trim() === '') return { error: copy.errWeightMissing, kg: null };
  const v = parseDecimal(d.weight);
  const bounds =
    d.units === 'metric'
      ? { min: WEIGHT_KG.min, max: WEIGHT_KG.max, error: copy.errWeightMetric }
      : { min: IMPERIAL_WEIGHT_LB.min, max: IMPERIAL_WEIGHT_LB.max, error: copy.errWeightImperial };
  if (v === null || v < bounds.min || v > bounds.max) return { error: bounds.error, kg: null };
  return { error: null, kg: round(d.units === 'metric' ? v : lbToKg(v), 2) };
}

/**
 * Validates the About you answers (AC 12, 13). An under-16 birth year wins over every other problem: the user is
 * stopped on the first question and nothing is kept.
 */
export function validateAbout(d: TargetsDraft, now: Date = new Date()): AboutResult {
  const year = validateBirthYear(d.birthYear, now);
  if (year.underage) return { ok: false, underage: true, errors: {}, first: 'birthYear' };

  const errors: AboutErrors = {};
  if (d.sex === null) errors.sex = copy.errSex;
  if (year.error) errors.birthYear = year.error;
  const height = validateHeight(d);
  if (height.error) errors[height.field] = height.error;
  const weight = validateWeight(d);
  if (weight.error) errors.weight = weight.error;

  const first = FIELD_ORDER.find((f) => errors[f]) ?? null;
  if (first || d.sex === null || year.year === null || height.cm === null || weight.kg === null) {
    return { ok: false, underage: false, errors, first };
  }
  return {
    ok: true,
    value: { sex: d.sex, birthYear: year.year, heightCm: height.cm, weightKg: weight.kg },
  };
}

/** Result of checking the chosen pace. `kg` is null when the goal is maintain or the pace is invalid. */
export function validatePace(
  pace: PaceChoice | null,
  units: UnitSystem,
  presetKgFor: (id: 'steady' | 'moderate' | 'faster') => number | null,
): { error: string | null; kg: number | null } {
  if (pace === null) return { error: copy.paceCustomError(units), kg: null };
  if (pace.kind === 'preset') {
    const kg = presetKgFor(pace.id);
    return kg === null ? { error: copy.paceCustomError(units), kg: null } : { error: null, kg };
  }
  const v = parseDecimal(pace.text);
  if (v === null) return { error: copy.paceCustomError(units), kg: null };
  // Range-check in the unit the user typed, matching the copy ("0.01 to 1.5 kg" / "0.02 to 3.3 lb").
  const range = units === 'metric' ? { min: 0.01, max: 1.5 } : { min: 0.02, max: 3.3 };
  if (v < range.min || v > range.max) return { error: copy.paceCustomError(units), kg: null };
  const kg = Math.min(MAX_WEEKLY_RATE_KG, Math.max(MIN_WEEKLY_RATE_KG, rateFromDisplay(v, units)));
  return { error: null, kg };
}
