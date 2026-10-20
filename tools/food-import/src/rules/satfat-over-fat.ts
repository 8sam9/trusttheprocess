import { isNum, type NutrientRule } from './types.js';

/** AC 21 `satfat_over_fat` (soft): saturated fat exceeds total fat beyond the rounding allowance. */
export const satfatOverFat: NutrientRule = (n, { rules }) =>
  isNum(n.satfat) && isNum(n.fat) && n.satfat > n.fat + rules.roundingAllowanceG;
