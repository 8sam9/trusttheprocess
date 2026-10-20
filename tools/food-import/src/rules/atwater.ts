import { isNum, type Nutrients, type RuleContext } from './types.js';

/**
 * Atwater estimate: 4 x protein + 4 x carbs + 9 x fat, plus 2 x fibre when the carbs basis is `available`
 * (AC 20). Returns null when the check cannot run: a core value is unknown, or the source reports alcohol
 * (alcohol carries 7 kcal/g and is not modelled, so such rows are neither flagged nor rejected).
 */
export function atwaterEstimate(n: Nutrients, ctx: RuleContext): number | null {
  if (!isNum(n.protein) || !isNum(n.carbs) || !isNum(n.fat)) return null;
  if (isNum(n.alcoholG) && n.alcoholG > 0) return null;
  let est = 4 * n.protein + 4 * n.carbs + 9 * n.fat;
  if (ctx.carbsBasis === 'available' && isNum(n.fibre)) est += 2 * n.fibre;
  return est;
}

/**
 * Deviation of the stated energy from the Atwater estimate: absolute kcal, and relative to the estimate.
 * When the estimate is 0 any positive deviation is infinitely large in relative terms.
 */
export function atwaterDeviation(
  n: Nutrients,
  ctx: RuleContext,
): { absKcal: number; relative: number } | null {
  const est = atwaterEstimate(n, ctx);
  if (est === null || !isNum(n.kcal)) return null;
  const absKcal = Math.abs(n.kcal - est);
  const relative = est > 0 ? absKcal / est : absKcal > 0 ? Number.POSITIVE_INFINITY : 0;
  return { absKcal, relative };
}
