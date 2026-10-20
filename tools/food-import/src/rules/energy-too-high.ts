import { isNum, type NutrientRule } from './types.js';

/** AC 19 `energy_too_high`: energy above 905 kcal per 100 g (pure fat is about 900). */
export const energyTooHigh: NutrientRule = (n, { rules }) =>
  isNum(n.kcal) && n.kcal > rules.energyMaxKcal;
