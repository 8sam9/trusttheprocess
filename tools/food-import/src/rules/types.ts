import type { CarbsBasis } from '@ttp/shared';
import type { RulesConfig } from '../schemas/config.js';

/** Canonical nutrients per 100 g in canonical units (g, mg, kcal). null = unknown, 0 = known zero (AC 10). */
export interface Nutrients {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  sugars: number | null;
  satfat: number | null;
  sodiumMg: number | null;
  /** Alcohol in g per 100 g when the source reports it; only used to skip the Atwater checks (AC 20). */
  alcoholG: number | null;
}

export interface RuleContext {
  rules: RulesConfig;
  carbsBasis: CarbsBasis;
}

/** A rule returns true when the nutrients VIOLATE it. Thresholds come from ctx.rules only (AC 24). */
export type NutrientRule = (n: Nutrients, ctx: RuleContext) => boolean;

export function isNum(v: number | null): v is number {
  return v !== null && Number.isFinite(v);
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
