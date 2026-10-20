import { atwaterDeviation } from './atwater.js';
import type { NutrientRule } from './types.js';

/** AC 19 `energy_implausible`: more than 50 percent AND more than 100 kcal away from the Atwater estimate. */
export const energyImplausible: NutrientRule = (n, ctx) => {
  const dev = atwaterDeviation(n, ctx);
  if (dev === null) return false;
  const t = ctx.rules.energyImplausible;
  return dev.relative > t.relative && dev.absKcal > t.absoluteKcal;
};
