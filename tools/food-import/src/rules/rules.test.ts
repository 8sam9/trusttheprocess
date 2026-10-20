import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import type { RulesConfig } from '../schemas/config.js';
import {
  applyRules,
  assignTier,
  atwaterEstimate,
  finaliseServings,
  isAllCaps,
  normaliseName,
  resolveEnergy,
  resolveSodiumMg,
  type Nutrients,
  type RuleContext,
} from './index.js';
import { energyAtwaterMismatch } from './energy-atwater-mismatch.js';
import { energyImplausible } from './energy-implausible.js';
import { energyTooHigh } from './energy-too-high.js';
import { massOver100g } from './mass-over-100g.js';
import { missingCore } from './missing-core.js';
import { negativeValue } from './negative-value.js';
import { satfatOverFat } from './satfat-over-fat.js';
import { sodiumImplausible } from './sodium-implausible.js';
import { sugarsOverCarbs } from './sugars-over-carbs.js';

let rules: RulesConfig;
let ctx: RuleContext;
beforeEach(() => {
  rules = structuredClone(loadConfig().rules);
  ctx = { rules, carbsBasis: 'total' };
});

/** Consistent baseline: 10 P + 20 C + 5 F = 165 kcal by Atwater. */
function nutrients(over: Partial<Nutrients> = {}): Nutrients {
  return {
    kcal: 165,
    protein: 10,
    carbs: 20,
    fat: 5,
    fibre: 2,
    sugars: 4,
    satfat: 1,
    sodiumMg: 100,
    alcoholG: null,
    ...over,
  };
}

describe('AC 8: kJ to kcal', () => {
  it('converts kJ only: 1000 kJ is 239.0 kcal, flagged', () => {
    expect(resolveEnergy(null, 1000, rules)).toEqual({ kcal: 239.0, flags: ['energy_from_kj'] });
  });
  it('uses kcal when both are present and consistent', () => {
    expect(resolveEnergy(239, 1000, rules)).toEqual({ kcal: 239, flags: [] });
  });
  it('flags energy_unit_mismatch when kcal and kJ disagree by more than 10 percent (AC 21)', () => {
    expect(resolveEnergy(300, 1000, rules)).toEqual({ kcal: 300, flags: ['energy_unit_mismatch'] });
    expect(resolveEnergy(250, 1000, rules).flags).toEqual([]); // 4.6 percent apart
  });
  it('zero kcal with zero kJ is consistent; nothing known stays null', () => {
    expect(resolveEnergy(0, 0, rules)).toEqual({ kcal: 0, flags: [] });
    expect(resolveEnergy(null, null, rules)).toEqual({ kcal: null, flags: [] });
  });
  it('threshold comes from config', () => {
    rules.energyUnitMismatchRelative = 0.01;
    expect(resolveEnergy(250, 1000, rules).flags).toEqual(['energy_unit_mismatch']);
  });
});

describe('AC 9: salt to sodium', () => {
  it('1.25 g salt is 500 mg sodium', () => expect(resolveSodiumMg(null, 1.25)).toBe(500));
  it('sodium wins over salt, including a known zero', () => {
    expect(resolveSodiumMg(120, 5)).toBe(120);
    expect(resolveSodiumMg(0, 5)).toBe(0);
  });
  it('unknown stays unknown (AC 10)', () => expect(resolveSodiumMg(null, null)).toBeNull());
});

describe('AC 17: names', () => {
  const max = 200;
  it('trims, collapses whitespace and normalises to NFC', () => {
    expect(normaliseName('  Whole \t milk\n 3.5%  ', 'name', max)).toBe('Whole milk 3.5%');
    expect(normaliseName('Cre\u0301me fraiche', 'name', max)).toBe('Cr\u00e9me fraiche');
    expect(normaliseName('Créme', 'name', max)).toBe(normaliseName('Créme', 'name', max));
  });
  it('converts ALL CAPS to sentence case (names) and title case (brands)', () => {
    expect(normaliseName('EGG, WHOLE, RAW, FRESH', 'name', max)).toBe('Egg, whole, raw, fresh');
    expect(normaliseName("MCDONALD'S KITCHEN-FRESH", 'brand', 120)).toBe(
      "Mcdonald's Kitchen-Fresh",
    );
  });
  it('leaves mixed case, short codes and symbols alone', () => {
    expect(normaliseName('Egg, whole, raw', 'name', max)).toBe('Egg, whole, raw');
    expect(normaliseName('BBQ', 'name', max)).toBe('BBQ');
    expect(isAllCaps('USDA')).toBe(true);
    expect(isAllCaps('12345')).toBe(false);
    expect(normaliseName('iPhone Bar', 'name', max)).toBe('iPhone Bar');
  });
  it('empty after trimming is null (the row is rejected as no_name)', () => {
    expect(normaliseName('   \n\t', 'name', max)).toBeNull();
    expect(normaliseName(null, 'name', max)).toBeNull();
    expect(normaliseName(undefined, 'brand', 120)).toBeNull();
  });
  it('truncates by code points, not UTF-16 units', () => {
    expect(Array.from(normaliseName('a'.repeat(300), 'name', 200) ?? '')).toHaveLength(200);
    const emoji = normaliseName('\u{1F34E}'.repeat(250), 'name', 200) ?? '';
    expect(Array.from(emoji)).toHaveLength(200);
  });
});

describe('AC 18: servings', () => {
  it('drops unknown, zero, negative and oversized weights; never guesses', () => {
    const out = finaliseServings(
      [
        { label: '1 large', grams: 50 },
        { label: '1 mystery', grams: null },
        { label: '1 zero', grams: 0 },
        { label: '1 negative', grams: -3 },
        { label: '1 nan', grams: Number.NaN },
        { label: '1 huge', grams: 5000.01 },
        { label: '1 max', grams: 5000 },
      ],
      rules,
    );
    expect(out).toEqual([
      { label: '1 large', grams: 50 },
      { label: '1 max', grams: 5000 },
    ]);
  });
  it('dedupes by label (first wins), collapses whitespace and keeps at most ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ label: `1  item ${i}`, grams: 10 + i }));
    const out = finaliseServings(
      [{ label: '1 cup', grams: 240 }, { label: '1 cup', grams: 1 }, ...many],
      rules,
    );
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ label: '1 cup', grams: 240 });
    expect(out[1]?.label).toBe('1 item 0');
  });
  it('a food with no usable servings is fine', () => {
    expect(finaliseServings([], rules)).toEqual([]);
  });
  it('limits come from config', () => {
    rules.limits.maxServings = 2;
    rules.limits.maxServingGrams = 100;
    const out = finaliseServings(
      [
        { label: 'a', grams: 50 },
        { label: 'b', grams: 500 },
        { label: 'c', grams: 60 },
        { label: 'd', grams: 70 },
      ],
      rules,
    );
    expect(out.map((s) => s.label)).toEqual(['a', 'c']);
  });
});

/** AC 19 to 22 and 24: every rule has a passing and a failing record. */
describe('rules in isolation (AC 19 to 22, 24)', () => {
  const cases: Array<{
    name: string;
    rule: (n: Nutrients, c: RuleContext) => boolean;
    pass: Partial<Nutrients>;
    fail: Partial<Nutrients>;
  }> = [
    { name: 'missing_core', rule: missingCore, pass: {}, fail: { protein: null } },
    { name: 'negative_value', rule: negativeValue, pass: { fibre: 0 }, fail: { fibre: -0.1 } },
    {
      name: 'mass_over_100g (single)',
      rule: massOver100g,
      pass: { fat: 100, protein: 0, carbs: 0 },
      fail: { fat: 100.1, protein: 0, carbs: 0 },
    },
    {
      name: 'mass_over_100g (sum)',
      rule: massOver100g,
      pass: { protein: 35, carbs: 35, fat: 35 },
      fail: { protein: 36, carbs: 35, fat: 35 },
    },
    { name: 'energy_too_high', rule: energyTooHigh, pass: { kcal: 905 }, fail: { kcal: 905.1 } },
    {
      name: 'energy_implausible',
      rule: energyImplausible,
      pass: { kcal: 165 + 90 },
      fail: { kcal: 165 + 110 },
    },
    {
      name: 'energy_atwater_mismatch',
      rule: energyAtwaterMismatch,
      pass: { kcal: 165 + 30 },
      fail: { kcal: 165 + 40 },
    },
    {
      name: 'sugars_over_carbs',
      rule: sugarsOverCarbs,
      pass: { carbs: 20, sugars: 20.5 },
      fail: { carbs: 20, sugars: 20.6 },
    },
    {
      name: 'satfat_over_fat',
      rule: satfatOverFat,
      pass: { fat: 5, satfat: 5.5 },
      fail: { fat: 5, satfat: 5.6 },
    },
    {
      name: 'sodium_implausible',
      rule: sodiumImplausible,
      pass: { sodiumMg: 40000 },
      fail: { sodiumMg: 40001 },
    },
  ];

  it.each(cases)(
    '$name: passing record is not violated, failing record is',
    ({ rule, pass, fail }) => {
      expect(rule(nutrients(pass), ctx)).toBe(false);
      expect(rule(nutrients(fail), ctx)).toBe(true);
    },
  );

  it('sugars 0 and unknown sugars never violate', () => {
    expect(sugarsOverCarbs(nutrients({ sugars: null, carbs: 0 }), ctx)).toBe(false);
    expect(sugarsOverCarbs(nutrients({ sugars: 0, carbs: 0 }), ctx)).toBe(false);
  });

  it('energy_atwater_mismatch needs BOTH the relative and the absolute threshold', () => {
    // 4 kcal estimate (1 g protein): 30 kcal stated is 650 percent off but only 26 kcal absolute -> flag;
    // 28 kcal stated is 24 absolute (not above 25) -> no flag.
    const tiny = { protein: 1, carbs: 0, fat: 0 };
    expect(energyAtwaterMismatch(nutrients({ ...tiny, kcal: 30 }), ctx)).toBe(true);
    expect(energyAtwaterMismatch(nutrients({ ...tiny, kcal: 28 }), ctx)).toBe(false);
    // 900 kcal estimate (100 g fat): 25 percent relative would be 225 absolute; 10 percent is neither
    expect(
      energyAtwaterMismatch(nutrients({ protein: 0, carbs: 0, fat: 100, kcal: 810 }), ctx),
    ).toBe(false);
  });

  it('AC 20: the estimate adds 2 x fibre only for the available basis', () => {
    const n = nutrients({ fibre: 10 });
    expect(atwaterEstimate(n, { rules, carbsBasis: 'total' })).toBe(165);
    expect(atwaterEstimate(n, { rules, carbsBasis: 'available' })).toBe(185);
    expect(atwaterEstimate(n, { rules, carbsBasis: 'unknown' })).toBe(165);
    // 185 stated: fine on the available basis, 12 percent / 20 kcal off on total -> still under both thresholds
    const heavy = nutrients({ fibre: 30, kcal: 165 + 60 });
    expect(energyAtwaterMismatch(heavy, { rules, carbsBasis: 'available' })).toBe(false);
    expect(energyAtwaterMismatch(heavy, { rules, carbsBasis: 'total' })).toBe(true);
  });

  it('AC 20: alcohol skips the Atwater checks entirely', () => {
    const wine = nutrients({
      kcal: 300,
      protein: 0,
      carbs: 3,
      fat: 0,
      sugars: 1,
      satfat: 0,
      alcoholG: 11,
    });
    expect(energyImplausible(wine, ctx)).toBe(false);
    expect(energyAtwaterMismatch(wine, ctx)).toBe(false);
    expect(applyRules(wine, ctx)).toEqual({ reject: null, flags: [] });
    // alcohol reported as 0 does not skip it
    expect(energyAtwaterMismatch({ ...wine, alcoholG: 0 }, ctx)).toBe(true);
  });

  it('AC 22: all-zero rows (water, black coffee) pass and are not flagged', () => {
    const water = nutrients({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      sugars: 0,
      satfat: 0,
      sodiumMg: 0,
    });
    expect(applyRules(water, ctx)).toEqual({ reject: null, flags: [] });
  });

  it('AC 19: each reject reason is reported on its own', () => {
    const reasonOf = (over: Partial<Nutrients>) => applyRules(nutrients(over), ctx).reject;
    expect(reasonOf({ kcal: null })).toBe('missing_core');
    expect(reasonOf({ sugars: -1 })).toBe('negative_value');
    expect(reasonOf({ fat: 101, kcal: 900 })).toBe('mass_over_100g');
    expect(reasonOf({ protein: 0, carbs: 0, fat: 100, kcal: 906 })).toBe('energy_too_high');
    expect(reasonOf({ kcal: 600 })).toBe('energy_implausible');
    expect(reasonOf({})).toBeNull();
  });

  it('AC 21: soft flags are collected, not rejected', () => {
    const r = applyRules(nutrients({ sugars: 25, satfat: 9, sodiumMg: 50000 }), ctx);
    expect(r.reject).toBeNull();
    expect(r.flags).toEqual(['sugars_over_carbs', 'satfat_over_fat', 'sodium_implausible']);
  });

  it('AC 24: thresholds come from config only (mutating it changes the verdict, rules are untouched)', () => {
    const doubtful = nutrients({ kcal: 165 + 40 });
    expect(applyRules(doubtful, ctx).flags).toEqual(['energy_atwater_mismatch']);
    rules.atwaterMismatch = { relative: 0.5, absoluteKcal: 25 };
    expect(applyRules(doubtful, { rules, carbsBasis: 'total' }).flags).toEqual([]);

    rules.massOver100.singleMaxG = 50;
    expect(
      applyRules(nutrients({ carbs: 60, kcal: 4 * 10 + 4 * 60 + 45 }), {
        rules,
        carbsBasis: 'total',
      }).reject,
    ).toBe('mass_over_100g');
    rules.energyMaxKcal = 100;
    expect(applyRules(nutrients(), { rules, carbsBasis: 'total' }).reject).not.toBeNull();
    rules.roundingAllowanceG = 10;
    expect(
      sugarsOverCarbs(nutrients({ carbs: 20, sugars: 25 }), { rules, carbsBasis: 'total' }),
    ).toBe(false);
    rules.sodiumImplausibleMg = 10;
    expect(sodiumImplausible(nutrients({ sodiumMg: 11 }), { rules, carbsBasis: 'total' })).toBe(
      true,
    );
  });
});

describe('AC 23: tier', () => {
  it('USDA generic datasets are verified, Branded is brand', () => {
    for (const dataset of ['usda_foundation', 'usda_sr_legacy', 'usda_fndds'] as const) {
      expect(assignTier({ dataset, flags: [] })).toBe('verified');
    }
    expect(assignTier({ dataset: 'usda_branded', flags: [] })).toBe('brand');
  });
  it('OFF is brand only with nutrition-facts-completed and no quality flag', () => {
    expect(assignTier({ dataset: 'off', flags: [], offNutritionFactsCompleted: true })).toBe(
      'brand',
    );
    expect(assignTier({ dataset: 'off', flags: [] })).toBe('community');
    expect(
      assignTier({
        dataset: 'off',
        flags: ['sugars_over_carbs'],
        offNutritionFactsCompleted: true,
      }),
    ).toBe('community');
  });
  it('quality flags demote to community; informational flags do not', () => {
    for (const f of [
      'energy_atwater_mismatch',
      'sugars_over_carbs',
      'satfat_over_fat',
      'sodium_implausible',
      'energy_unit_mismatch',
    ] as const) {
      expect(assignTier({ dataset: 'usda_foundation', flags: [f] })).toBe('community');
    }
    for (const f of [
      'energy_from_kj',
      'volume_basis_assumed',
      'invalid_barcode',
      'restricted_barcode',
    ] as const) {
      expect(assignTier({ dataset: 'usda_foundation', flags: [f] })).toBe('verified');
    }
  });
});
