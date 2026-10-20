import { isNum, type NutrientRule } from './types.js';

/** AC 19 `missing_core`: any of energy, protein, carbs or fat is unknown. */
export const missingCore: NutrientRule = (n) =>
  !isNum(n.kcal) || !isNum(n.protein) || !isNum(n.carbs) || !isNum(n.fat);
