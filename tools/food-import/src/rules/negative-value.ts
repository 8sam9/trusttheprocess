import { isNum, type NutrientRule } from './types.js';

/** AC 19 `negative_value`: any known nutrient is below zero. */
export const negativeValue: NutrientRule = (n) =>
  [n.kcal, n.protein, n.carbs, n.fat, n.fibre, n.sugars, n.satfat, n.sodiumMg].some(
    (v) => isNum(v) && v < 0,
  );
