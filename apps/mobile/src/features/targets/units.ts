import { cmToFtIn, ftInToCm, kgToLb, lbToKg, round, type UnitSystem } from '@ttp/shared';

/** Presentation-layer unit helpers. Storage is always metric; these only convert what the user types or sees. */

/** Parses a typed number. Accepts "," or "." as the decimal separator (Android decimal pads follow the locale). */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "70", "70.5" (never "70.0"). */
export function trimNumber(n: number, decimals: number): string {
  return String(round(n, decimals));
}

/** At least one decimal, two when needed: 1 -> "1.0", 0.5 -> "0.5", 0.25 -> "0.25". Used for custom pace labels. */
export function oneOrTwoDecimals(n: number): string {
  const hundredths = Math.round(n * 100);
  return hundredths % 10 === 0 ? (hundredths / 100).toFixed(1) : (hundredths / 100).toFixed(2);
}

export function weightToDisplay(kg: number, units: UnitSystem): string {
  return units === 'metric' ? trimNumber(kg, 1) : trimNumber(kgToLb(kg), 1);
}

export function heightToDisplay(cm: number): { cm: string; ft: string; in: string } {
  const ftIn = cmToFtIn(cm);
  return { cm: trimNumber(cm, 1), ft: String(ftIn.ft), in: String(ftIn.in) };
}

/** kg a week -> the unit the user sees (kg or lb), unrounded. */
export const rateToDisplay = (kg: number, units: UnitSystem): number =>
  units === 'metric' ? kg : kgToLb(kg);

/** Typed pace in the user's unit -> kg a week, rounded to the stored 2 decimals. */
export const rateFromDisplay = (value: number, units: UnitSystem): number =>
  round(units === 'metric' ? value : lbToKg(value), 2);

/** Converts typed height and weight when the unit system changes. Unparseable text is left as typed. */
export function convertBodyText(
  from: UnitSystem,
  to: UnitSystem,
  t: { heightCm: string; heightFt: string; heightIn: string; weight: string },
): { heightCm: string; heightFt: string; heightIn: string; weight: string } {
  if (from === to) return t;
  let { heightCm, heightFt, heightIn, weight } = t;
  const w = parseDecimal(weight);
  if (w !== null) weight = to === 'imperial' ? trimNumber(kgToLb(w), 1) : trimNumber(lbToKg(w), 1);
  if (to === 'imperial') {
    const cm = parseDecimal(heightCm);
    if (cm !== null) {
      const ftIn = cmToFtIn(cm);
      heightFt = String(ftIn.ft);
      heightIn = String(ftIn.in);
      heightCm = '';
    }
  } else {
    const ft = parseDecimal(heightFt);
    if (ft !== null || parseDecimal(heightIn) !== null) {
      heightCm = String(Math.round(ftInToCm(ft ?? 0, parseDecimal(heightIn) ?? 0)));
      heightFt = '';
      heightIn = '';
    }
  }
  return { heightCm, heightFt, heightIn, weight };
}

/** Converts a typed custom pace when units change. */
export function convertPaceText(from: UnitSystem, to: UnitSystem, text: string): string {
  const v = parseDecimal(text);
  if (v === null || from === to) return text;
  const kg = from === 'metric' ? v : lbToKg(v);
  return trimNumber(to === 'metric' ? kg : kgToLb(kg), 2);
}
