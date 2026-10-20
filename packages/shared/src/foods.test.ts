import { describe, expect, it } from 'vitest';
import {
  FOOD_TIER_LABEL,
  FoodDataset,
  FoodFlagCode,
  FoodHiddenReason,
  FoodMarket,
  FoodRow,
  FoodRpcErrorCode,
  FoodServing,
  GET_FOODS_MAX_IDS,
  GetFoodsArgs,
  LookupBarcodeArgs,
  MAX_FOOD_NAME,
  MAX_SERVING_GRAMS,
  MAX_SERVINGS,
  SEARCH_FOODS_MAX_LIMIT,
  SearchFoodsArgs,
} from './foods';

const UUID = '3f2b8c1e-6d4a-5b7e-8c9d-0a1b2c3d4e5f';
const ids = (n: number): string[] => Array.from({ length: n }, () => UUID);

const row = {
  id: UUID,
  source: 'usda',
  dataset: 'usda_foundation',
  source_ref: '123',
  name: 'Egg, whole, raw',
  name_lang: 'en',
  alt_names: null,
  brand: null,
  barcode: null,
  kcal: 143,
  protein_g: 12.6,
  carbs_g: 0.7,
  fat_g: 9.5,
  fibre_g: 0,
  sugars_g: null,
  satfat_g: 3.1,
  sodium_mg: null,
  carbs_basis: 'total',
  tier: 'verified',
  reasons: [],
  hidden: false,
  is_canonical: true,
  servings: [{ label: '1 large', grams: 50 }],
  updated_at: '2026-10-20 10:00:00+00',
};

describe('constants and enums', () => {
  it('pins the limits from the plan', () => {
    expect(MAX_SERVINGS).toBe(10);
    expect(MAX_SERVING_GRAMS).toBe(5000);
    expect(MAX_FOOD_NAME).toBe(200);
    expect(GET_FOODS_MAX_IDS).toBe(200);
    expect(SEARCH_FOODS_MAX_LIMIT).toBe(50);
  });

  it('has the tier labels fixed in the spec copy', () => {
    expect(FOOD_TIER_LABEL).toEqual({
      verified: 'Verified',
      brand: 'Brand',
      community: 'Community',
    });
  });

  it('has 9 soft flags, 10 hide reasons, 5 datasets, 7 markets, no overlap between flags and hide reasons', () => {
    expect(FoodFlagCode.options).toHaveLength(9);
    expect(FoodHiddenReason.options).toHaveLength(10);
    expect(FoodDataset.options).toHaveLength(5);
    expect(FoodMarket.options).toHaveLength(7);
    const overlap = FoodFlagCode.options.filter((f) =>
      (FoodHiddenReason.options as string[]).includes(f),
    );
    expect(overlap).toEqual([]);
  });

  it('has the two RPC error codes', () => {
    expect(FoodRpcErrorCode.options).toEqual(['too_many_ids', 'invalid_input']);
  });
});

describe('FoodServing boundaries', () => {
  it('accepts grams in (0, 5000]', () => {
    expect(FoodServing.safeParse({ label: '1 cup', grams: 5000 }).success).toBe(true);
    expect(FoodServing.safeParse({ label: '1 pinch', grams: 0.1 }).success).toBe(true);
  });
  it('rejects 0, negative and above 5000 grams', () => {
    expect(FoodServing.safeParse({ label: 'x', grams: 0 }).success).toBe(false);
    expect(FoodServing.safeParse({ label: 'x', grams: -1 }).success).toBe(false);
    expect(FoodServing.safeParse({ label: 'x', grams: 5000.01 }).success).toBe(false);
    expect(FoodServing.safeParse({ label: 'x', grams: Number.NaN }).success).toBe(false);
  });
  it('limits the label to 1..80 characters', () => {
    expect(FoodServing.safeParse({ label: 'a'.repeat(80), grams: 1 }).success).toBe(true);
    expect(FoodServing.safeParse({ label: 'a'.repeat(81), grams: 1 }).success).toBe(false);
    expect(FoodServing.safeParse({ label: '', grams: 1 }).success).toBe(false);
  });
  it('is strict about extra keys', () => {
    expect(FoodServing.safeParse({ label: 'x', grams: 1, extra: 1 }).success).toBe(false);
  });
});

describe('FoodRow', () => {
  it('parses a valid row, with unknown nutrients as null', () => {
    const parsed = FoodRow.parse(row);
    expect(parsed.sugars_g).toBeNull();
    expect(parsed.fibre_g).toBe(0);
  });

  it('accepts 0 and 10 servings, rejects 11', () => {
    const s = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `s${i}`, grams: 10 }));
    expect(FoodRow.safeParse({ ...row, servings: s(0) }).success).toBe(true);
    expect(FoodRow.safeParse({ ...row, servings: s(MAX_SERVINGS) }).success).toBe(true);
    expect(FoodRow.safeParse({ ...row, servings: s(MAX_SERVINGS + 1) }).success).toBe(false);
  });

  it('rejects a serving over 5,000 g inside a row', () => {
    expect(FoodRow.safeParse({ ...row, servings: [{ label: 'x', grams: 5001 }] }).success).toBe(
      false,
    );
  });

  it('rejects null core nutrients, unknown enum values and malformed barcodes', () => {
    expect(FoodRow.safeParse({ ...row, kcal: null }).success).toBe(false);
    expect(FoodRow.safeParse({ ...row, tier: 'gold' }).success).toBe(false);
    expect(FoodRow.safeParse({ ...row, source: 'ai' }).success).toBe(false);
    expect(FoodRow.safeParse({ ...row, barcode: '12345' }).success).toBe(false);
    expect(FoodRow.safeParse({ ...row, barcode: '00036000291452' }).success).toBe(true);
    expect(FoodRow.safeParse({ ...row, reasons: ['superseded'] }).success).toBe(false);
    expect(FoodRow.safeParse({ ...row, reasons: ['energy_from_kj'] }).success).toBe(true);
  });

  it('accepts Italian display names with alternative names', () => {
    const r = FoodRow.safeParse({
      ...row,
      source: 'off',
      dataset: 'off',
      name_lang: 'en',
      alt_names: { it: 'Passata di pomodoro' },
    });
    expect(r.success).toBe(true);
  });
});

describe('GetFoodsArgs boundaries (200 ids)', () => {
  it('accepts 1 and 200 ids', () => {
    expect(GetFoodsArgs.safeParse({ p_ids: ids(1) }).success).toBe(true);
    expect(GetFoodsArgs.safeParse({ p_ids: ids(GET_FOODS_MAX_IDS) }).success).toBe(true);
  });
  it('rejects 0 and 201 ids, non-uuids and extra keys', () => {
    expect(GetFoodsArgs.safeParse({ p_ids: [] }).success).toBe(false);
    expect(GetFoodsArgs.safeParse({ p_ids: ids(GET_FOODS_MAX_IDS + 1) }).success).toBe(false);
    expect(GetFoodsArgs.safeParse({ p_ids: ['nope'] }).success).toBe(false);
    expect(GetFoodsArgs.safeParse({ p_ids: ids(1), extra: true }).success).toBe(false);
  });
});

describe('LookupBarcodeArgs', () => {
  it('requires exactly 14 digits', () => {
    expect(LookupBarcodeArgs.safeParse({ p_gtin14: '00036000291452' }).success).toBe(true);
    expect(LookupBarcodeArgs.safeParse({ p_gtin14: '036000291452' }).success).toBe(false);
    expect(LookupBarcodeArgs.safeParse({ p_gtin14: '000360002914521' }).success).toBe(false);
    expect(LookupBarcodeArgs.safeParse({ p_gtin14: '0003600029145a' }).success).toBe(false);
    expect(LookupBarcodeArgs.safeParse({ p_gtin14: '00036000291452\n' }).success).toBe(false);
  });
});

describe('SearchFoodsArgs boundaries (limit 50, query 100)', () => {
  it('accepts limit 1..50 or omitted', () => {
    expect(SearchFoodsArgs.safeParse({ p_query: 'egg' }).success).toBe(true);
    expect(SearchFoodsArgs.safeParse({ p_query: 'egg', p_limit: 1 }).success).toBe(true);
    expect(
      SearchFoodsArgs.safeParse({ p_query: 'egg', p_limit: SEARCH_FOODS_MAX_LIMIT }).success,
    ).toBe(true);
  });
  it('rejects limit 0, 51, fractions', () => {
    expect(SearchFoodsArgs.safeParse({ p_query: 'egg', p_limit: 0 }).success).toBe(false);
    expect(SearchFoodsArgs.safeParse({ p_query: 'egg', p_limit: 51 }).success).toBe(false);
    expect(SearchFoodsArgs.safeParse({ p_query: 'egg', p_limit: 1.5 }).success).toBe(false);
  });
  it('trims the query and bounds it to 1..100 characters', () => {
    expect(SearchFoodsArgs.parse({ p_query: '  egg  ' }).p_query).toBe('egg');
    expect(SearchFoodsArgs.safeParse({ p_query: '   ' }).success).toBe(false);
    expect(SearchFoodsArgs.safeParse({ p_query: '' }).success).toBe(false);
    expect(SearchFoodsArgs.safeParse({ p_query: 'a'.repeat(100) }).success).toBe(true);
    expect(SearchFoodsArgs.safeParse({ p_query: 'a'.repeat(101) }).success).toBe(false);
  });
});
