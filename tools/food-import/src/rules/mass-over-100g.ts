import { isNum, type NutrientRule } from './types.js';

/** AC 19 `mass_over_100g`: protein, carbs or fat above 100 g, or the three together above 105 g. */
export const massOver100g: NutrientRule = (n, { rules }) => {
  const parts = [n.protein, n.carbs, n.fat].filter(isNum);
  if (parts.some((v) => v > rules.massOver100.singleMaxG)) return true;
  return parts.reduce((a, b) => a + b, 0) > rules.massOver100.sumMaxG;
};
