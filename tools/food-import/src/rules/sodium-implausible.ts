import { isNum, type NutrientRule } from './types.js';

/** AC 21 `sodium_implausible` (soft): sodium above 40 g (40,000 mg) per 100 g. */
export const sodiumImplausible: NutrientRule = (n, { rules }) =>
  isNum(n.sodiumMg) && n.sodiumMg > rules.sodiumImplausibleMg;
