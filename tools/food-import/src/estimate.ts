import type { BudgetConfig } from './schemas/config.js';
import type { NormalisedFood } from './types.js';

export type BudgetSegment = keyof BudgetConfig['segments'];

const utf8 = (s: string | null | undefined): number => (s ? Buffer.byteLength(s, 'utf8') : 0);

export function segmentOf(food: Pick<NormalisedFood, 'dataset' | 'markets'>): BudgetSegment {
  if (food.dataset !== 'usda_branded' && food.dataset !== 'off') return 'usda_generic';
  return food.markets.includes('it') && !food.markets.includes('us') ? 'it' : 'us_branded';
}

/**
 * Size estimate of one stored row (spec T2.3 step 1). The constants come from config/budget.json and are
 * recalibrated from actual/estimated after the first full run (B12).
 */
export function estimateBytes(food: NormalisedFood, budget: BudgetConfig): number {
  const seg = budget.segments[segmentOf(food)];
  const text = `${food.name} ${food.brand ?? ''}`;
  const alt = food.altNames === null ? 0 : utf8(JSON.stringify(food.altNames));
  const est =
    seg.baseBytes +
    utf8(food.name) +
    utf8(food.brand) +
    alt +
    budget.bytesPerServing * food.servings.length +
    budget.trigramFactor * utf8(text) -
    seg.baseNameAllowance;
  return Math.max(0, Math.round(est));
}
