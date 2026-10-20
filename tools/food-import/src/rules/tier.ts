import type { FoodDataset, FoodFlagCode, FoodTier } from '@ttp/shared';

/**
 * Flags that demote a row to `community` (AC 20, 21, 23): the five quality flags. The other four soft flags
 * (`energy_from_kj`, `volume_basis_assumed`, `invalid_barcode`, `restricted_barcode`) are informational: they
 * say how a value was derived, not that it looks doubtful, so they do not change the tier.
 * (Reading of "any soft-flagged row is community"; raised as an open question in the spec.)
 */
export const COMMUNITY_FLAGS: ReadonlySet<FoodFlagCode> = new Set<FoodFlagCode>([
  'energy_atwater_mismatch',
  'sugars_over_carbs',
  'satfat_over_fat',
  'sodium_implausible',
  'energy_unit_mismatch',
]);

export interface TierInput {
  dataset: FoodDataset;
  flags: readonly FoodFlagCode[];
  /** OFF only: the product carries `en:nutrition-facts-completed` (spec Q6). */
  offNutritionFactsCompleted?: boolean;
}

/** AC 23: exactly one tier per row. */
export function assignTier(input: TierInput): FoodTier {
  if (input.flags.some((f) => COMMUNITY_FLAGS.has(f))) return 'community';
  switch (input.dataset) {
    case 'usda_foundation':
    case 'usda_sr_legacy':
    case 'usda_fndds':
      return 'verified';
    case 'usda_branded':
      return 'brand';
    case 'off':
      return input.offNutritionFactsCompleted === true ? 'brand' : 'community';
  }
}
