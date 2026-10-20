import { FoodServing } from '@ttp/shared';
import type { RulesConfig } from '../schemas/config.js';
import { round } from './types.js';

export interface ServingCandidate {
  label: string;
  grams: number | null | undefined;
}

/**
 * AC 18: named servings. A serving whose weight cannot be determined (missing, not finite, 0 or negative) or is
 * above the limit is DROPPED, never guessed. Labels are whitespace-collapsed, de-duplicated by label (first
 * wins, upstream order), and at most `maxServings` are kept. The implicit 100 g basis is not stored.
 */
export function finaliseServings(
  candidates: readonly ServingCandidate[],
  rules: RulesConfig,
): FoodServing[] {
  const out: FoodServing[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (out.length >= rules.limits.maxServings) break;
    if (typeof c.grams !== 'number' || !Number.isFinite(c.grams)) continue;
    const grams = round(c.grams, 2);
    if (grams <= 0 || grams > rules.limits.maxServingGrams) continue;
    let label = c.label.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (label === '') continue;
    label = Array.from(label).slice(0, rules.limits.servingLabelMaxChars).join('').trimEnd();
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(FoodServing.parse({ label, grams }));
  }
  return out;
}
