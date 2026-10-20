import { atwaterDeviation } from './atwater.js';
import type { NutrientRule } from './types.js';

/** AC 20 `energy_atwater_mismatch` (soft): more than 20 percent AND more than 25 kcal off. Reject wins first. */
export const energyAtwaterMismatch: NutrientRule = (n, ctx) => {
  const dev = atwaterDeviation(n, ctx);
  if (dev === null) return false;
  const t = ctx.rules.atwaterMismatch;
  return dev.relative > t.relative && dev.absKcal > t.absoluteKcal;
};
