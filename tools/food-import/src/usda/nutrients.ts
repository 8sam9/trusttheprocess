import type { Nutrients } from '../rules/types.js';
import { round } from '../rules/types.js';
import type { UsdaNutrientEntry } from './schemas.js';

/**
 * Map from FDC nutrients to the canonical set (spec T5.5). Candidates are tried in order; the first with a
 * finite amount and a convertible unit wins. Matching is by nutrient `id`, or by `number` as a fallback.
 *
 * Nutrient ids and numbers are from the FDC documentation and NOT verified against real files (H1):
 * 1008/208 Energy kcal, 2048/958 and 2047/957 Atwater specific and general energy, 1062/268 Energy kJ,
 * 1003/203 Protein, 1004/204 Total lipid, 1085/298 Total fat (NLEA), 1005/205 Carbohydrate by difference,
 * 1050/205.2 Carbohydrate by summation, 1079/291 Fibre, 2033/293 Fibre AOAC, 2000/269.3 Total sugars,
 * 1063/269 Sugars (NLEA), 1258/606 Saturated fat, 1093/307 Sodium, 1018/221 Alcohol.
 */

type Unit = 'g' | 'mg' | 'kcal' | 'kj';

interface Candidate {
  id: number;
  number: string;
}

export interface NutrientSpec {
  unit: Unit;
  candidates: readonly Candidate[];
}

export const USDA_NUTRIENTS = {
  kcal: {
    unit: 'kcal',
    candidates: [
      { id: 1008, number: '208' },
      { id: 2048, number: '958' },
      { id: 2047, number: '957' },
    ],
  },
  kj: { unit: 'kj', candidates: [{ id: 1062, number: '268' }] },
  protein: { unit: 'g', candidates: [{ id: 1003, number: '203' }] },
  fat: {
    unit: 'g',
    candidates: [
      { id: 1004, number: '204' },
      { id: 1085, number: '298' },
    ],
  },
  carbs: {
    unit: 'g',
    candidates: [
      { id: 1005, number: '205' },
      { id: 1050, number: '205.2' },
    ],
  },
  fibre: {
    unit: 'g',
    candidates: [
      { id: 1079, number: '291' },
      { id: 2033, number: '293' },
    ],
  },
  sugars: {
    unit: 'g',
    candidates: [
      { id: 2000, number: '269.3' },
      { id: 1063, number: '269' },
    ],
  },
  satfat: { unit: 'g', candidates: [{ id: 1258, number: '606' }] },
  sodium: { unit: 'mg', candidates: [{ id: 1093, number: '307' }] },
  alcohol: { unit: 'g', candidates: [{ id: 1018, number: '221' }] },
} as const satisfies Record<string, NutrientSpec>;

/** Converts an amount in the upstream unit to the canonical unit; null if the unit cannot be converted. */
export function convertUnit(
  amount: number,
  rawUnit: string | null | undefined,
  target: Unit,
): number | null {
  const unit = (rawUnit ?? '').trim().toLowerCase().replace('µ', 'u');
  if (target === 'kcal') return unit === 'kcal' ? amount : null;
  if (target === 'kj') return unit === 'kj' ? amount : null;
  const toGrams: Record<string, number> = { g: 1, mg: 1e-3, ug: 1e-6, mcg: 1e-6 };
  const factor = toGrams[unit];
  if (factor === undefined) return null;
  const grams = amount * factor;
  return target === 'g' ? round(grams, 6) : round(grams * 1000, 6);
}

function lookup(entries: readonly UsdaNutrientEntry[], spec: NutrientSpec): number | null {
  for (const cand of spec.candidates) {
    const hit = entries.find(
      (e) => e.nutrient.id === cand.id || (e.nutrient.number ?? null) === cand.number,
    );
    if (!hit || typeof hit.amount !== 'number' || !Number.isFinite(hit.amount)) continue;
    const value = convertUnit(hit.amount, hit.nutrient.unitName, spec.unit);
    if (value !== null) return value;
  }
  return null;
}

export interface UsdaNutrientValues {
  nutrients: Nutrients;
  /** Energy in kJ when published (only used when kcal is missing). */
  kj: number | null;
}

/** Extracts the canonical nutrients per 100 g from an FDC foodNutrients array. Missing stays null (AC 10). */
export function extractUsdaNutrients(entries: readonly UsdaNutrientEntry[]): UsdaNutrientValues {
  return {
    nutrients: {
      kcal: lookup(entries, USDA_NUTRIENTS.kcal),
      protein: lookup(entries, USDA_NUTRIENTS.protein),
      carbs: lookup(entries, USDA_NUTRIENTS.carbs),
      fat: lookup(entries, USDA_NUTRIENTS.fat),
      fibre: lookup(entries, USDA_NUTRIENTS.fibre),
      sugars: lookup(entries, USDA_NUTRIENTS.sugars),
      satfat: lookup(entries, USDA_NUTRIENTS.satfat),
      sodiumMg: lookup(entries, USDA_NUTRIENTS.sodium),
      alcoholG: lookup(entries, USDA_NUTRIENTS.alcohol),
    },
    kj: lookup(entries, USDA_NUTRIENTS.kj),
  };
}
