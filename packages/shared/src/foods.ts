import { z } from 'zod';

/**
 * Food catalogue contract (spec 002, T4; ADR 0006). Shared by the importer, the read RPCs and the app's
 * single food-data access module. Mirrors the enums in migration 20261021090000_food_catalogue.sql.
 */

export const MAX_SERVINGS = 10;
export const MAX_SERVING_GRAMS = 5000;
export const MAX_FOOD_NAME = 200;
export const GET_FOODS_MAX_IDS = 200;
export const SEARCH_FOODS_MAX_LIMIT = 50;

export const FoodSource = z.enum(['usda', 'off']);
export type FoodSource = z.infer<typeof FoodSource>;

export const FoodDataset = z.enum([
  'usda_foundation',
  'usda_sr_legacy',
  'usda_fndds',
  'usda_branded',
  'off',
]);
export type FoodDataset = z.infer<typeof FoodDataset>;

export const FoodTier = z.enum(['verified', 'brand', 'community']);
export type FoodTier = z.infer<typeof FoodTier>;

export const CarbsBasis = z.enum(['total', 'available', 'unknown']);
export type CarbsBasis = z.infer<typeof CarbsBasis>;

export const FoodMarket = z.enum(['us', 'it', 'gb', 'ie', 'ca', 'au', 'nz']);
export type FoodMarket = z.infer<typeof FoodMarket>;

/** Soft flags: stored in food.foods.reasons[]. */
export const FoodFlagCode = z.enum([
  'energy_from_kj',
  'volume_basis_assumed',
  'invalid_barcode',
  'restricted_barcode',
  'energy_atwater_mismatch',
  'sugars_over_carbs',
  'satfat_over_fat',
  'sodium_implausible',
  'energy_unit_mismatch',
]);
export type FoodFlagCode = z.infer<typeof FoodFlagCode>;

/** Hide reasons: stored in food.foods.hidden_reason. */
export const FoodHiddenReason = z.enum([
  'superseded',
  'removed_upstream',
  'not_selected',
  'over_budget',
  'missing_core',
  'negative_value',
  'mass_over_100g',
  'energy_too_high',
  'energy_implausible',
  'no_name',
]);
export type FoodHiddenReason = z.infer<typeof FoodHiddenReason>;

/** Copy fixed in spec 002 section 7; rendered by 003 and 009. */
export const FOOD_TIER_LABEL: Readonly<Record<FoodTier, string>> = {
  verified: 'Verified',
  brand: 'Brand',
  community: 'Community',
};

export const FoodServing = z.strictObject({
  label: z.string().min(1).max(80),
  grams: z.number().gt(0).max(MAX_SERVING_GRAMS),
});
export type FoodServing = z.infer<typeof FoodServing>;

/**
 * Row returned by get_foods, lookup_barcode and search_foods (T3). Per 100 g; null means unknown, 0 means a known zero.
 * `updated_at` is a plain string: PostgREST returns offsets like "+00:00", which z.iso.datetime() rejects.
 */
export const FoodRow = z.object({
  id: z.uuid(),
  source: FoodSource,
  dataset: FoodDataset,
  source_ref: z.string(),
  name: z.string(),
  name_lang: z.enum(['en', 'it']),
  alt_names: z.record(z.string(), z.string()).nullable(),
  brand: z.string().nullable(),
  /** Normalised GTIN-14, or null. */
  barcode: z
    .string()
    .regex(/^\d{14}$/)
    .nullable(),
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fibre_g: z.number().nullable(),
  sugars_g: z.number().nullable(),
  satfat_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
  carbs_basis: CarbsBasis,
  tier: FoodTier,
  reasons: z.array(FoodFlagCode),
  hidden: z.boolean(),
  is_canonical: z.boolean(),
  servings: z.array(FoodServing).max(MAX_SERVINGS),
  updated_at: z.string(),
});
export type FoodRow = z.infer<typeof FoodRow>;

export const GetFoodsArgs = z.strictObject({
  p_ids: z.array(z.uuid()).min(1).max(GET_FOODS_MAX_IDS),
});
export type GetFoodsArgs = z.infer<typeof GetFoodsArgs>;

export const LookupBarcodeArgs = z.strictObject({
  p_gtin14: z.string().regex(/^\d{14}$/),
});
export type LookupBarcodeArgs = z.infer<typeof LookupBarcodeArgs>;

export const SearchFoodsArgs = z.strictObject({
  p_query: z.string().trim().min(1).max(100),
  p_limit: z.int().min(1).max(SEARCH_FOODS_MAX_LIMIT).optional(),
});
export type SearchFoodsArgs = z.infer<typeof SearchFoodsArgs>;

export const FoodRpcErrorCode = z.enum(['too_many_ids', 'invalid_input']);
export type FoodRpcErrorCode = z.infer<typeof FoodRpcErrorCode>;
