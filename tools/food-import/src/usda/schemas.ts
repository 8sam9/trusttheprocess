import { z } from 'zod';

/**
 * Pinned shapes of USDA FoodData Central JSON records (spec T6.3). Only the fields the importer reads are
 * listed; unknown fields are ignored. Field names follow the FDC field-descriptions document.
 *
 * SYNTHETIC-PINNED: the sandbox could not reach the USDA hosts (H1), so these shapes come from the documented
 * schema and were exercised only on upstream-shaped synthetic records. The human re-pins them against real
 * records via `cut-fixture` before 002a QA.
 */

const idLike = z.union([z.string().min(1), z.number()]).transform((v) => String(v));

export const UsdaNutrientEntry = z.object({
  nutrient: z.object({
    id: z.number().int(),
    number: idLike.nullish(),
    name: z.string().nullish(),
    unitName: z.string().nullish(),
  }),
  amount: z.number().nullish(),
});
export type UsdaNutrientEntry = z.infer<typeof UsdaNutrientEntry>;

export const UsdaPortion = z.object({
  gramWeight: z.number().nullish(),
  amount: z.number().nullish(),
  modifier: idLike.nullish(),
  portionDescription: z.string().nullish(),
  sequenceNumber: z.number().int().nullish(),
  measureUnit: z
    .object({
      name: z.string().nullish(),
      abbreviation: z.string().nullish(),
    })
    .nullish(),
});
export type UsdaPortion = z.infer<typeof UsdaPortion>;

/** Foundation, SR Legacy and Survey (FNDDS) records. */
export const UsdaGenericFood = z.object({
  fdcId: z.number().int().positive(),
  description: z.string(),
  dataType: z.string().nullish(),
  publicationDate: z.string().nullish(),
  /** Foundation and SR Legacy. */
  ndbNumber: idLike.nullish(),
  /** Survey (FNDDS). */
  foodCode: idLike.nullish(),
  foodNutrients: z.array(UsdaNutrientEntry),
  foodPortions: z.array(UsdaPortion).default([]),
});
export type UsdaGenericFood = z.infer<typeof UsdaGenericFood>;

/** Top-level key of each dataset's JSON file (the file holds a single object with one array under it). */
export const USDA_TOP_KEY = {
  usda_foundation: 'FoundationFoods',
  usda_sr_legacy: 'SRLegacyFoods',
  usda_fndds: 'SurveyFoods',
  usda_branded: 'BrandedFoods',
} as const;
export type UsdaDataset = keyof typeof USDA_TOP_KEY;
export type UsdaGenericDataset = Exclude<UsdaDataset, 'usda_branded'>;

export function detectUsdaDataset(topKey: string): UsdaDataset | null {
  const hit = (Object.entries(USDA_TOP_KEY) as [UsdaDataset, string][]).find(
    ([, k]) => k === topKey,
  );
  return hit ? hit[0] : null;
}

export function isUsdaGenericDataset(d: string): d is UsdaGenericDataset {
  return d === 'usda_foundation' || d === 'usda_sr_legacy' || d === 'usda_fndds';
}
