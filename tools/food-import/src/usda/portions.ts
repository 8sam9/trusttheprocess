import type { ServingCandidate } from '../rules/servings.js';
import type { UsdaPortion } from './schemas.js';

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/**
 * Label for one FDC portion (AC 18), in English.
 * 1. `portionDescription` is the full text when present (FNDDS style, e.g. "1 cup, chopped"), except the
 *    placeholder "Quantity not specified", which carries no usable label.
 * 2. Otherwise amount + measure unit + modifier (SR Legacy / Foundation style): "1 cup, sliced" or "1 large".
 *    A measure unit named "undetermined" is omitted; a purely numeric modifier is an internal code and is ignored.
 * 3. Without any unit or modifier there is nothing to say, so the portion is dropped (returns null).
 */
export function portionLabel(p: UsdaPortion): string | null {
  const desc = (p.portionDescription ?? '').replace(/\s+/g, ' ').trim();
  if (desc !== '' && !/^quantity not specified$/i.test(desc)) return desc;

  const unitRaw = (p.measureUnit?.name ?? '').trim();
  const unit = unitRaw === '' || /^undetermined$/i.test(unitRaw) ? '' : unitRaw;
  const modRaw = (p.modifier ?? '').replace(/\s+/g, ' ').trim();
  const modifier = /^\d+$/.test(modRaw) ? '' : modRaw;
  if (unit === '' && modifier === '') return null;

  const amount = formatAmount(typeof p.amount === 'number' && p.amount > 0 ? p.amount : 1);
  if (unit === '') return `${amount} ${modifier}`;
  return modifier === '' ? `${amount} ${unit}` : `${amount} ${unit}, ${modifier}`;
}

/** Portions in upstream order (`sequenceNumber`, then array order) as serving candidates. */
export function usdaServingCandidates(portions: readonly UsdaPortion[]): ServingCandidate[] {
  return portions
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.sequenceNumber ?? 1e9) - (b.p.sequenceNumber ?? 1e9) || a.i - b.i)
    .flatMap(({ p }) => {
      const label = portionLabel(p);
      return label === null ? [] : [{ label, grams: p.gramWeight }];
    });
}
