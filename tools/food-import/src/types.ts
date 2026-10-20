import type {
  CarbsBasis,
  FoodDataset,
  FoodFlagCode,
  FoodMarket,
  FoodServing,
  FoodSource,
  FoodTier,
} from '@ttp/shared';
import type { RejectReason } from './rules/index.js';

/**
 * A food after normalisation and rules, ready for the engine (B6) to hash, diff and write.
 * Holds only upstream-derived columns; run, release and timestamps are added by the engine.
 */
export interface NormalisedFood {
  id: string;
  source: FoodSource;
  dataset: FoodDataset;
  sourceRef: string;
  upstreamId: string | null;
  name: string;
  nameLang: 'en' | 'it';
  altNames: Record<string, string> | null;
  brand: string | null;
  /** Normalised GTIN-14, or null. */
  barcode: string | null;
  barcodeRestricted: boolean;
  markets: FoodMarket[];
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number | null;
  sugarsG: number | null;
  satfatG: number | null;
  sodiumMg: number | null;
  carbsBasis: CarbsBasis;
  tier: FoodTier;
  /** Soft flags only (FoodFlagCode); hide reasons never appear here. */
  reasons: FoodFlagCode[];
  servings: FoodServing[];
  popularity: number | null;
  /** ISO-8601 UTC, or null when the upstream date is missing or unparseable. */
  upstreamModifiedAt: string | null;
}

export interface FoodRef {
  id: string;
  dataset: FoodDataset;
  sourceRef: string;
}

/** What the normaliser decides for one upstream record. Rejected rows carry no values (never stored). */
export type FoodOutcome =
  | { kind: 'candidate'; food: NormalisedFood }
  | { kind: 'rejected'; ref: FoodRef; reason: RejectReason };

/** A record that did not match the pinned upstream shape; counted as `parse_error` (fails the run above 1%). */
export interface ParseFailure {
  kind: 'parse_error';
  /** 0-based position in the upstream array. */
  index: number;
  message: string;
}
