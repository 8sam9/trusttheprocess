import { FoodFlagCode } from '@ttp/shared';
import { foodId } from '../identity.js';
import {
  applyRules,
  assignTier,
  finaliseServings,
  normaliseName,
  resolveEnergy,
  resolveSodiumMg,
} from '../rules/index.js';
import type { RulesConfig } from '../schemas/config.js';
import type { FoodOutcome } from '../types.js';
import { extractUsdaNutrients } from './nutrients.js';
import { usdaServingCandidates } from './portions.js';
import type { UsdaGenericDataset, UsdaGenericFood } from './schemas.js';

/**
 * Stable upstream key (T1 #7). The current fdcId changes whenever a food's data changes, so it is kept only
 * as `upstream_id`. Foundation and SR Legacy use ndbNumber, FNDDS uses foodCode; `fdc:<fdcId>` is the fallback
 * when the stable key is absent.
 */
export function usdaGenericSourceRef(dataset: UsdaGenericDataset, rec: UsdaGenericFood): string {
  const stable = dataset === 'usda_fndds' ? rec.foodCode : rec.ndbNumber;
  const ref = (stable ?? '').trim();
  return ref !== '' ? ref : `fdc:${rec.fdcId}`;
}

/** FDC publicationDate is "M/D/YYYY" in the JSON files; ISO dates are accepted too. Returns ISO UTC or null. */
export function parseUsdaDate(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  let y: number, m: number, d: number;
  if (us) [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])] as [number, number, number];
  else if (iso)
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])] as [number, number, number];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString();
}

const FLAG_ORDER = FoodFlagCode.options;

/** Normalises one Foundation / SR Legacy / FNDDS record (AC 7 to 10, 13, 17 to 24). Pure. */
export function normaliseUsdaGeneric(
  rec: UsdaGenericFood,
  dataset: UsdaGenericDataset,
  rules: RulesConfig,
): FoodOutcome {
  const sourceRef = usdaGenericSourceRef(dataset, rec);
  const ref = { id: foodId(dataset, sourceRef), dataset, sourceRef };

  const name = normaliseName(rec.description, 'name', rules.limits.nameMaxCodePoints);
  if (name === null) return { kind: 'rejected', ref, reason: 'no_name' };

  const { nutrients, kj } = extractUsdaNutrients(rec.foodNutrients);
  const energy = resolveEnergy(nutrients.kcal, kj, rules);
  const resolved = {
    ...nutrients,
    kcal: energy.kcal,
    sodiumMg: resolveSodiumMg(nutrients.sodiumMg, null),
  };

  // USDA carbohydrates include fibre (AC 13): the basis is always `total`, the value is as published.
  const carbsBasis = 'total' as const;
  const verdict = applyRules(resolved, { rules, carbsBasis });
  if (verdict.reject !== null) return { kind: 'rejected', ref, reason: verdict.reject };

  const flags = [...new Set([...energy.flags, ...verdict.flags])].sort(
    (a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b),
  );

  // applyRules guarantees the four core values are known and in range.
  return {
    kind: 'candidate',
    food: {
      id: ref.id,
      source: 'usda',
      dataset,
      sourceRef,
      upstreamId: String(rec.fdcId),
      name,
      nameLang: 'en',
      altNames: null,
      brand: null,
      barcode: null,
      barcodeRestricted: false,
      markets: [],
      kcal: resolved.kcal as number,
      proteinG: resolved.protein as number,
      carbsG: resolved.carbs as number,
      fatG: resolved.fat as number,
      fibreG: resolved.fibre,
      sugarsG: resolved.sugars,
      satfatG: resolved.satfat,
      sodiumMg: resolved.sodiumMg,
      carbsBasis,
      tier: assignTier({ dataset, flags }),
      reasons: flags,
      servings: finaliseServings(usdaServingCandidates(rec.foodPortions), rules),
      popularity: null,
      upstreamModifiedAt: parseUsdaDate(rec.publicationDate),
    },
  };
}
