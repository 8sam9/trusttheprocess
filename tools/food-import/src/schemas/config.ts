import { z } from 'zod';
import { CarbsBasis, FoodMarket } from '@ttp/shared';

/** config/markets.json (AC 4): which markets are on, and which name languages each accepts. */
export const MarketEntry = z.strictObject({
  enabled: z.boolean(),
  offCountryTag: z.string().regex(/^en:[a-z-]+$/),
  usdaMarketCountry: z.string().min(1).nullable(),
  nameLanguages: z.array(z.enum(['en', 'it'])).min(1),
  /** Carbs basis implied by the market's label rules (spec T6.4 step 3). */
  carbsBasis: CarbsBasis,
});
export type MarketEntry = z.infer<typeof MarketEntry>;

export const MarketsConfig = z.strictObject({
  markets: z.partialRecord(FoodMarket, MarketEntry).refine((m) => Object.keys(m).length > 0, {
    message: 'at least one market must be configured',
  }),
});
export type MarketsConfig = z.infer<typeof MarketsConfig>;

const positive = z.number().positive();
const fraction = z.number().min(0).max(1);

/** config/rules.json: every threshold of AC 19 to 21 (AC 24: rules read thresholds only from here). */
export const RulesConfig = z.strictObject({
  massOver100: z.strictObject({ singleMaxG: positive, sumMaxG: positive }),
  energyMaxKcal: positive,
  energyImplausible: z.strictObject({ relative: positive, absoluteKcal: positive }),
  atwaterMismatch: z.strictObject({ relative: positive, absoluteKcal: positive }),
  roundingAllowanceG: z.number().min(0),
  sodiumImplausibleMg: positive,
  energyUnitMismatchRelative: positive,
  limits: z.strictObject({
    nameMaxCodePoints: z.int().positive(),
    brandMaxCodePoints: z.int().positive(),
    servingLabelMaxChars: z.int().positive(),
    maxServings: z.int().positive(),
    maxServingGrams: positive,
    minPerServingQuantityG: positive,
  }),
});
export type RulesConfig = z.infer<typeof RulesConfig>;

export const BudgetSegment = z.strictObject({
  baseBytes: positive,
  baseNameAllowance: z.number().min(0),
});

/** config/budget.json (ADR 0008, spec T2). The engine (B12) consumes it; B3 only pins the shape. */
export const BudgetConfig = z
  .strictObject({
    budgetBytes: z.int().positive(),
    targetFraction: fraction,
    hardCeilingBytes: z.int().positive(),
    failOverFraction: fraction,
    bytesPerServing: positive,
    trigramFactor: positive,
    segments: z.strictObject({
      usda_generic: BudgetSegment,
      us_branded: BudgetSegment,
      it: BudgetSegment,
    }),
  })
  .refine((b) => b.hardCeilingBytes > b.budgetBytes, {
    message: 'hardCeilingBytes must be larger than budgetBytes',
    path: ['hardCeilingBytes'],
  });
export type BudgetConfig = z.infer<typeof BudgetConfig>;

export interface ImporterConfig {
  markets: MarketsConfig;
  rules: RulesConfig;
  budget: BudgetConfig;
}
