import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { foodId } from '../identity.js';
import type { RulesConfig } from '../schemas/config.js';
import { N, SYNTH_EGG, foundationRecord, simpleFood } from '../../test/helpers/synthetic-usda.js';
import { parseUsdaDate, normaliseUsdaGeneric, usdaGenericSourceRef } from './normalise.js';
import { convertUnit } from './nutrients.js';
import { UsdaGenericFood, type UsdaGenericDataset } from './schemas.js';

let rules: RulesConfig;
beforeEach(() => {
  rules = loadConfig().rules;
});

function run(rec: Record<string, unknown>, dataset: UsdaGenericDataset = 'usda_foundation') {
  return normaliseUsdaGeneric(UsdaGenericFood.parse(rec), dataset, rules);
}
function food(rec: Record<string, unknown>, dataset: UsdaGenericDataset = 'usda_foundation') {
  const out = run(rec, dataset);
  if (out.kind !== 'candidate') throw new Error(`expected candidate, got ${out.reason}`);
  return out.food;
}

describe('AC 7: canonical nutrients from a Foundation record (synthetic whole raw egg)', () => {
  it('maps every canonical nutrient to the expected value in the canonical unit', () => {
    const f = food(SYNTH_EGG);
    expect({
      kcal: f.kcal,
      protein: f.proteinG,
      carbs: f.carbsG,
      fat: f.fatG,
      fibre: f.fibreG,
      sugars: f.sugarsG,
      satfat: f.satfatG,
      sodium: f.sodiumMg,
    }).toEqual({
      kcal: 143,
      protein: 12.6,
      carbs: 0.72,
      fat: 9.51,
      fibre: 0,
      sugars: 0.37,
      satfat: 3.13,
      sodium: 142,
    });
    expect(f.name).toBe('Egg, whole, raw, fresh');
    expect(f.source).toBe('usda');
    expect(f.dataset).toBe('usda_foundation');
    expect(f.tier).toBe('verified');
    expect(f.reasons).toEqual([]);
    expect(f.nameLang).toBe('en');
    expect(f.brand).toBeNull();
    expect(f.barcode).toBeNull();
    expect(f.upstreamId).toBe('900101');
  });

  it('converts units: mg and ug to g, g to mg for sodium', () => {
    expect(convertUnit(500, 'MG', 'g')).toBe(0.5);
    expect(convertUnit(250000, 'UG', 'g')).toBe(0.25);
    expect(convertUnit(2.5, 'G', 'mg')).toBe(2500);
    expect(convertUnit(1, 'IU', 'g')).toBeNull();
    expect(convertUnit(1, 'KCAL', 'kj')).toBeNull();
    const f = food(
      simpleFood([
        N.kcal(165),
        N.protein(10),
        N.carbs(20),
        N.fat(5),
        { ...N.sodium(0.1), unit: 'G' }, // 0.1 g -> 100 mg
        { ...N.fibre(2000), unit: 'MG' }, // 2000 mg -> 2 g
      ]),
    );
    expect(f.sodiumMg).toBe(100);
    expect(f.fibreG).toBe(2);
  });
});

describe('AC 8: kJ to kcal and energy fallbacks', () => {
  it('kJ only gives kcal = kJ / 4.184 to one decimal with energy_from_kj', () => {
    const f = food(simpleFood([N.kj(1000), N.protein(5), N.carbs(40), N.fat(4)]));
    expect(f.kcal).toBe(239.0);
    expect(f.reasons).toEqual(['energy_from_kj']);
    expect(f.tier).toBe('verified'); // informational flag does not demote
  });
  it('kcal wins when both are present', () => {
    const f = food(simpleFood([N.kcal(239), N.kj(5000), N.protein(5), N.carbs(40), N.fat(4)]));
    expect(f.kcal).toBe(239);
    expect(f.reasons).toContain('energy_unit_mismatch');
    expect(f.tier).toBe('community');
  });
  it('falls back to the Atwater general energy (2047) before kJ when 1008 is absent', () => {
    const f = food(simpleFood([N.atwaterGeneral(165), N.protein(10), N.carbs(20), N.fat(5)]));
    expect(f.kcal).toBe(165);
    expect(f.reasons).toEqual([]);
  });
});

describe('AC 10: unknown is not zero', () => {
  it('missing optional nutrients are null, an upstream 0 stays 0', () => {
    const f = food(simpleFood([N.kcal(165), N.protein(10), N.carbs(20), N.fat(5), N.sugars(0)]));
    expect(f.sugarsG).toBe(0);
    expect(f.fibreG).toBeNull();
    expect(f.satfatG).toBeNull();
    expect(f.sodiumMg).toBeNull();
  });
  it('an entry with no amount is unknown, not zero', () => {
    const f = food(simpleFood([N.kcal(165), N.protein(10), N.carbs(20), N.fat(5), N.fibre(null)]));
    expect(f.fibreG).toBeNull();
  });
});

describe('AC 13: carbs basis', () => {
  it('USDA rows are total and the value is as published (fibre not subtracted)', () => {
    const f = food(simpleFood([N.kcal(165), N.protein(10), N.carbs(20), N.fat(5), N.fibre(8)]));
    expect(f.carbsBasis).toBe('total');
    expect(f.carbsG).toBe(20);
  });
});

describe('rejects and flags through the normaliser (AC 19 to 23)', () => {
  const base = [N.kcal(165), N.protein(10), N.carbs(20), N.fat(5)];
  it('empty name is rejected as no_name', () => {
    const out = run(simpleFood(base, { description: '   ' }));
    expect(out).toMatchObject({ kind: 'rejected', reason: 'no_name' });
  });
  it('a rejected row still carries its identity so the engine can hide a stored copy (AC 34)', () => {
    const out = run(simpleFood([N.kcal(165), N.protein(10), N.carbs(20)], { ndbNumber: 777 }));
    expect(out).toEqual({
      kind: 'rejected',
      reason: 'missing_core',
      ref: { id: foodId('usda_foundation', '777'), dataset: 'usda_foundation', sourceRef: '777' },
    });
  });
  it('rejects a negative value and an implausible energy', () => {
    expect(run(simpleFood([...base, N.sugars(-1)]))).toMatchObject({ reason: 'negative_value' });
    expect(run(simpleFood([N.kcal(900), N.protein(10), N.carbs(20), N.fat(5)]))).toMatchObject({
      reason: 'energy_implausible',
    });
  });
  it('stores a soft-flagged row as community with its reason code', () => {
    const f = food(simpleFood([...base, N.sugars(30)]));
    expect(f.reasons).toEqual(['sugars_over_carbs']);
    expect(f.tier).toBe('community');
  });
  it('all-zero rows pass (water)', () => {
    const f = food(
      simpleFood([N.kcal(0), N.protein(0), N.carbs(0), N.fat(0)], { description: 'Water, tap' }),
    );
    expect(f.reasons).toEqual([]);
    expect(f.tier).toBe('verified');
  });
  it('every generic dataset produces verified rows', () => {
    expect(food(simpleFood(base), 'usda_sr_legacy').tier).toBe('verified');
    expect(
      food(simpleFood(base, { foodCode: '11111000', ndbNumber: undefined }), 'usda_fndds').tier,
    ).toBe('verified');
  });
  it('names are cleaned: ALL CAPS and spacing', () => {
    expect(food(simpleFood(base, { description: '  CHEESE,   MOZZARELLA ' })).name).toBe(
      'Cheese, mozzarella',
    );
  });
});

describe('identity (T1 #7)', () => {
  it('Foundation and SR Legacy use ndbNumber, FNDDS uses foodCode, the fdcId is only upstream_id', () => {
    const rec = UsdaGenericFood.parse(
      foundationRecord({ fdcId: 321, ndbNumber: 1123, foodCode: '99', nutrients: [] }),
    );
    expect(usdaGenericSourceRef('usda_foundation', rec)).toBe('1123');
    expect(usdaGenericSourceRef('usda_sr_legacy', rec)).toBe('1123');
    expect(usdaGenericSourceRef('usda_fndds', rec)).toBe('99');
  });
  it('the same food keeps its id when the fdcId changes between releases (AC 31)', () => {
    const v1 = food(
      simpleFood([N.kcal(165), N.protein(10), N.carbs(20), N.fat(5)], { fdcId: 1, ndbNumber: 42 }),
    );
    const v2 = food(
      simpleFood([N.kcal(170), N.protein(10), N.carbs(20), N.fat(5)], { fdcId: 2, ndbNumber: 42 }),
    );
    expect(v2.id).toBe(v1.id);
    expect(v2.upstreamId).toBe('2');
    expect(v1.id).toBe(foodId('usda_foundation', '42'));
  });
  it('falls back to fdc:<fdcId> when the stable key is missing', () => {
    const rec = UsdaGenericFood.parse(foundationRecord({ fdcId: 555, nutrients: [] }));
    expect(usdaGenericSourceRef('usda_foundation', rec)).toBe('fdc:555');
  });
  it('ids differ per dataset for the same reference and are deterministic', () => {
    expect(foodId('usda_foundation', '1')).not.toBe(foodId('usda_sr_legacy', '1'));
    expect(foodId('usda_foundation', '1')).toBe(foodId('usda_foundation', '1'));
  });
});

describe('dates', () => {
  it('parses the FDC M/D/YYYY form and ISO dates, rejects the rest', () => {
    expect(parseUsdaDate('4/1/2025')).toBe('2025-04-01T00:00:00.000Z');
    expect(parseUsdaDate('2025-12-18')).toBe('2025-12-18T00:00:00.000Z');
    expect(parseUsdaDate('13/45/2025')).toBeNull();
    expect(parseUsdaDate('2/30/2025')).toBeNull();
    expect(parseUsdaDate('yesterday')).toBeNull();
    expect(parseUsdaDate(null)).toBeNull();
  });
});

describe('AC 18: servings from portions', () => {
  it('the egg gets "1 large" and "1 cup, chopped" with their gram weights', () => {
    expect(food(SYNTH_EGG).servings).toEqual([
      { label: '1 large', grams: 50 },
      { label: '1 cup, chopped', grams: 243 },
    ]);
  });
});
