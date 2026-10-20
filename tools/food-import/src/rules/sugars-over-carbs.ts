import { isNum, type NutrientRule } from './types.js';

/** AC 21 `sugars_over_carbs` (soft): sugars exceed total carbs beyond the rounding allowance. */
export const sugarsOverCarbs: NutrientRule = (n, { rules }) =>
  isNum(n.sugars) && isNum(n.carbs) && n.sugars > n.carbs + rules.roundingAllowanceG;
