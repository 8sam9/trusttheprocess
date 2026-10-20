/**
 * SYNTHETIC upstream-shaped USDA FoodData Central records for unit tests.
 *
 * These were NOT cut from a real release (the sandbox cannot reach the USDA hosts, H1). Shapes follow the
 * documented FDC JSON schema; values are plausible approximations written by hand. Do not treat any number
 * here as USDA data. The human replaces them with real records via `cut-fixture` before 002a QA.
 */

export interface SynthNutrient {
  id: number;
  number: string;
  unit: string;
  amount: number | null;
}

export const N = {
  kcal: (amount: number | null): SynthNutrient => ({
    id: 1008,
    number: '208',
    unit: 'KCAL',
    amount,
  }),
  kj: (amount: number | null): SynthNutrient => ({ id: 1062, number: '268', unit: 'kJ', amount }),
  atwaterGeneral: (amount: number): SynthNutrient => ({
    id: 2047,
    number: '957',
    unit: 'KCAL',
    amount,
  }),
  protein: (amount: number | null): SynthNutrient => ({
    id: 1003,
    number: '203',
    unit: 'G',
    amount,
  }),
  fat: (amount: number | null): SynthNutrient => ({ id: 1004, number: '204', unit: 'G', amount }),
  carbs: (amount: number | null): SynthNutrient => ({ id: 1005, number: '205', unit: 'G', amount }),
  fibre: (amount: number | null): SynthNutrient => ({ id: 1079, number: '291', unit: 'G', amount }),
  sugars: (amount: number | null): SynthNutrient => ({
    id: 2000,
    number: '269.3',
    unit: 'G',
    amount,
  }),
  satfat: (amount: number | null): SynthNutrient => ({
    id: 1258,
    number: '606',
    unit: 'G',
    amount,
  }),
  sodium: (amount: number | null): SynthNutrient => ({
    id: 1093,
    number: '307',
    unit: 'MG',
    amount,
  }),
  alcohol: (amount: number | null): SynthNutrient => ({
    id: 1018,
    number: '221',
    unit: 'G',
    amount,
  }),
};

export function entry(n: SynthNutrient): Record<string, unknown> {
  const e: Record<string, unknown> = {
    type: 'FoodNutrient',
    nutrient: {
      id: n.id,
      number: n.number,
      name: `synthetic ${n.number}`,
      rank: 1,
      unitName: n.unit,
    },
  };
  if (n.amount !== null) e['amount'] = n.amount;
  return e;
}

export interface SynthFood {
  fdcId?: number;
  description?: string;
  ndbNumber?: string | number | undefined;
  foodCode?: string | undefined;
  publicationDate?: string;
  nutrients: SynthNutrient[];
  portions?: Record<string, unknown>[];
  dataType?: string;
}

export function foundationRecord(f: SynthFood): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    fdcId: f.fdcId ?? 900001,
    description: f.description ?? 'Synthetic test food',
    dataType: f.dataType ?? 'Foundation',
    publicationDate: f.publicationDate ?? '4/1/2025',
    foodNutrients: f.nutrients.map(entry),
    foodPortions: f.portions ?? [],
    // fields the importer must ignore
    foodCategory: { description: 'Synthetic category' },
    inputFoods: [],
  };
  if (f.ndbNumber !== undefined) rec['ndbNumber'] = f.ndbNumber;
  if (f.foodCode !== undefined) rec['foodCode'] = f.foodCode;
  return rec;
}

/** Whole raw egg, Foundation-shaped. Values approximate; NOT real USDA data. */
export const SYNTH_EGG = foundationRecord({
  fdcId: 900101,
  description: 'Egg, whole, raw, fresh',
  ndbNumber: 1123,
  nutrients: [
    N.kcal(143),
    N.protein(12.6),
    N.fat(9.51),
    N.carbs(0.72),
    N.fibre(0),
    N.sugars(0.37),
    N.satfat(3.13),
    N.sodium(142),
  ],
  portions: [
    {
      id: 1,
      amount: 1,
      gramWeight: 50,
      modifier: 'large',
      sequenceNumber: 1,
      measureUnit: { id: 9999, name: 'undetermined', abbreviation: 'undetermined' },
    },
    {
      id: 2,
      amount: 1,
      gramWeight: 243,
      modifier: 'chopped',
      sequenceNumber: 2,
      measureUnit: { id: 1000, name: 'cup', abbreviation: 'cup' },
    },
  ],
});

/** A valid food with the given nutrients, for rule-level tests through the whole normaliser. */
export function simpleFood(
  nutrients: SynthNutrient[],
  extra: Partial<SynthFood> = {},
): Record<string, unknown> {
  return foundationRecord({ ndbNumber: 5000, ...extra, nutrients });
}
