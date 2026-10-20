import type { FoodFlagCode, FoodHiddenReason } from '@ttp/shared';
import { energyAtwaterMismatch } from './energy-atwater-mismatch.js';
import { energyImplausible } from './energy-implausible.js';
import { energyTooHigh } from './energy-too-high.js';
import { massOver100g } from './mass-over-100g.js';
import { missingCore } from './missing-core.js';
import { negativeValue } from './negative-value.js';
import { satfatOverFat } from './satfat-over-fat.js';
import { sodiumImplausible } from './sodium-implausible.js';
import { sugarsOverCarbs } from './sugars-over-carbs.js';
import type { NutrientRule, Nutrients, RuleContext } from './types.js';

export type RejectReason = Extract<
  FoodHiddenReason,
  | 'missing_core'
  | 'negative_value'
  | 'mass_over_100g'
  | 'energy_too_high'
  | 'energy_implausible'
  | 'no_name'
>;

/** Evaluated in this order; the first violated rule is the single reason the row is counted under. */
export const REJECT_RULES: ReadonlyArray<
  readonly [Exclude<RejectReason, 'no_name'>, NutrientRule]
> = [
  ['missing_core', missingCore],
  ['negative_value', negativeValue],
  ['mass_over_100g', massOver100g],
  ['energy_too_high', energyTooHigh],
  ['energy_implausible', energyImplausible],
];

export const SOFT_FLAG_RULES: ReadonlyArray<readonly [FoodFlagCode, NutrientRule]> = [
  ['energy_atwater_mismatch', energyAtwaterMismatch],
  ['sugars_over_carbs', sugarsOverCarbs],
  ['satfat_over_fat', satfatOverFat],
  ['sodium_implausible', sodiumImplausible],
];

export interface RuleResult {
  reject: RejectReason | null;
  flags: FoodFlagCode[];
}

/** AC 19 to 22. All-zero rows violate nothing (AC 22). */
export function applyRules(n: Nutrients, ctx: RuleContext): RuleResult {
  for (const [code, rule] of REJECT_RULES) {
    if (rule(n, ctx)) return { reject: code, flags: [] };
  }
  const flags = SOFT_FLAG_RULES.filter(([, rule]) => rule(n, ctx)).map(([code]) => code);
  return { reject: null, flags };
}

export * from './types.js';
export { resolveEnergy, KJ_PER_KCAL } from './energy.js';
export { resolveSodiumMg, SALT_TO_SODIUM_MG_PER_G } from './sodium.js';
export { normaliseName, isAllCaps } from './names.js';
export { finaliseServings, type ServingCandidate } from './servings.js';
export { assignTier, COMMUNITY_FLAGS, type TierInput } from './tier.js';
export { atwaterEstimate, atwaterDeviation } from './atwater.js';
