import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { FIXTURE_DIR } from './paths.js';
import { cutFixture, discoverUsdaLinks, findInputFile, jaccard, pruneUsdaRecord } from './cut.js';
import { UsdaGenericFood } from '../usda/schemas.js';
import { writeZip } from '../../test/helpers/zip.js';
import { N, foundationRecord, SYNTH_EGG } from '../../test/helpers/synthetic-usda.js';

describe('discoverUsdaLinks', () => {
  const html = `
    <a href="/fdc-datasets/FoodData_Central_foundation_food_json_2025-12-18.zip">Foundation JSON</a>
    <a href="/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip">Foundation CSV</a>
    <a href="/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip">SR Legacy JSON</a>
    <a href="/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip">FNDDS JSON</a>
    <a href="/fdc-datasets/FoodData_Central_branded_food_json_2025-12-18.zip">Branded JSON</a>
    <a href="/fdc-datasets/FoodData_Central_foundation_food_json_2025-04-24.zip">older Foundation</a>`;

  it('finds the newest JSON zip per dataset on the official host and never Branded or CSV', () => {
    const links = discoverUsdaLinks(html, 'https://fdc.nal.usda.gov/download-datasets');
    expect(links).toEqual({
      usda_foundation:
        'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-12-18.zip',
      usda_sr_legacy:
        'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
      usda_fndds:
        'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    });
  });

  it('returns nothing for a page without links (the caller falls back to known names)', () => {
    expect(discoverUsdaLinks('<html></html>', 'https://fdc.nal.usda.gov/x')).toEqual({});
  });
});

describe('helpers', () => {
  it('jaccard scores token overlap', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });

  it('prunes a record to the allowlisted fields and the nutrient ids the importer reads', () => {
    const raw = {
      ...(SYNTH_EGG as Record<string, unknown>),
      foodNutrients: [
        ...(SYNTH_EGG['foodNutrients'] as unknown[]),
        { nutrient: { id: 1106, number: '320', name: 'Vitamin A', unitName: 'UG' }, amount: 160 },
      ],
      inputFoods: [{ secret: 'x' }],
      foodAttributes: ['x'],
    };
    const parsed = UsdaGenericFood.parse(raw);
    const pruned = pruneUsdaRecord(parsed, raw);
    expect(Object.keys(pruned)).toEqual([
      'fdcId',
      'description',
      'dataType',
      'publicationDate',
      'ndbNumber',
      'foodNutrients',
      'foodPortions',
    ]);
    const ids = (pruned['foodNutrients'] as { nutrient: { id: number } }[]).map(
      (n) => n.nutrient.id,
    );
    expect(ids).not.toContain(1106);
    expect(ids).toContain(1008);
  });
});

describe('cutFixture on stand-in downloads', () => {
  let tmp: string;
  let fixtureDir: string;
  let downloads: string;
  const log: string[] = [];

  beforeEach(async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'cut-fixture-'));
    fixtureDir = path.join(tmp, 'fixtures');
    downloads = path.join(tmp, 'downloads');
    mkdirSync(downloads, { recursive: true });
    cpSync(FIXTURE_DIR, fixtureDir, { recursive: true });
    // a small golden list: one exact match, one found under another ref, one required miss, one optional miss
    const golden = [
      {
        dataset: 'usda_sr_legacy',
        sourceRef: '1123',
        referenceName: 'Egg, whole, raw, fresh',
        kcalRange: [130, 160],
        expectedServingLabel: '1 large',
      },
      {
        dataset: 'usda_sr_legacy',
        sourceRef: '9040',
        referenceName: 'Bananas, raw',
        kcalRange: [80, 100],
        expectedServingLabel: '1 medium',
      },
      {
        dataset: 'usda_sr_legacy',
        sourceRef: '4053',
        referenceName: 'Oil, olive, salad or cooking',
        kcalRange: [800, 900],
      },
      {
        dataset: 'usda_fndds',
        sourceRef: '58100100',
        referenceName: 'Gnocchi, potato',
        kcalRange: [100, 160],
        optional: true,
      },
    ];
    writeFileSync(path.join(fixtureDir, 'golden-list.json'), JSON.stringify(golden));
    const ids = JSON.parse(readFileSync(path.join(fixtureDir, 'fixture-ids.json'), 'utf8'));
    ids.sample = { usda_foundation: 1, usda_sr_legacy: 1, usda_fndds: 1 };
    writeFileSync(path.join(fixtureDir, 'fixture-ids.json'), JSON.stringify(ids));

    const banana = foundationRecord({
      fdcId: 173944,
      description: 'Bananas, raw',
      ndbNumber: 9999, // another ref than the recalled one
      dataType: 'SR Legacy',
      nutrients: [N.kcal(89), N.protein(1.09), N.carbs(22.84), N.fat(0.33)],
      portions: [
        {
          amount: 1,
          gramWeight: 118,
          modifier: 'medium (7" to 7-7/8" long)',
          sequenceNumber: 1,
          measureUnit: { name: 'undetermined' },
        },
      ],
    });
    const egg = { ...SYNTH_EGG, ndbNumber: 1123, description: 'Egg, whole, raw, fresh' };
    const olive = foundationRecord({
      fdcId: 171413,
      description: 'Oil, olive, salad or cooking',
      ndbNumber: 4053,
      nutrients: [N.kcal(500), N.protein(0), N.carbs(0), N.fat(55)], // wrong on purpose: out of range
    });
    await writeZip(
      path.join(downloads, 'FoodData_Central_sr_legacy_food_json_2018-04.zip'),
      'sr.json',
      [JSON.stringify({ SRLegacyFoods: [egg, banana, olive] })],
    );
    writeFileSync(
      path.join(downloads, 'FoodData_Central_foundation_food_json_2025-12-18.json'),
      JSON.stringify({
        FoundationFoods: [
          foundationRecord({
            fdcId: 1,
            ndbNumber: 111,
            description: 'Real foundation food',
            nutrients: [N.kcal(87), N.protein(5), N.carbs(10), N.fat(3)],
          }),
        ],
      }),
    );
    writeFileSync(
      path.join(downloads, 'FoodData_Central_survey_food_json_2024-10-31.json'),
      JSON.stringify({
        SurveyFoods: [
          foundationRecord({
            fdcId: 2,
            foodCode: '1',
            description: 'Something else',
            nutrients: [N.kcal(87), N.protein(5), N.carbs(10), N.fat(3)],
          }),
        ],
      }),
    );
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes real records, re-pins by name, keeps rule rows and placeholders, and prints what to fix', async () => {
    log.length = 0;
    const result = await cutFixture({
      from: downloads,
      idsFile: path.join(fixtureDir, 'fixture-ids.json'),
      fixtureDir,
      rules: loadConfig().rules,
      version: 'test',
      contact: undefined,
      today: () => '2026-01-01',
      log: (l) => log.push(l),
    });
    const text = result.lines.join('\n');

    // re-pinned banana, kept exact egg, flagged the olive oil energy
    const golden = JSON.parse(readFileSync(path.join(fixtureDir, 'golden-list.json'), 'utf8')) as {
      sourceRef: string;
      referenceName: string;
    }[];
    expect(golden.find((g) => g.referenceName === 'Bananas, raw')?.sourceRef).toBe('9999');
    expect(golden.find((g) => g.referenceName === 'Egg, whole, raw, fresh')?.sourceRef).toBe(
      '1123',
    );
    expect(text).toContain('re-pinned [usda_sr_legacy] "Bananas, raw"');
    expect(text).toMatch(/energy 500 kcal is outside 800 to 900/);
    expect(text).toMatch(/NEEDS YOUR ATTENTION/);
    expect(text).toMatch(/not found \(optional\): "Gnocchi, potato"/);
    // the banana serving label differs from the recalled one only by a suffix, so it matches (startsWith)
    expect(text).not.toMatch(/no serving starting with "1 medium"/);
    expect(result.needsAttention).toBe(true);

    // written files: real SR records, no placeholders left for found entries
    const sr = JSON.parse(readFileSync(path.join(fixtureDir, 'usda', 'sr_legacy.v1.json'), 'utf8'));
    const refs = (sr.SRLegacyFoods as { ndbNumber: number; x_synthetic?: string }[])
      .filter((r) => r.x_synthetic === undefined)
      .map((r) => r.ndbNumber)
      .sort();
    expect(refs).toEqual([1123, 4053, 9999]);
    expect(sr._fixture.synthetic).toBe(false);
    expect(sr._fixture.upstreamRelease).toContain('2018-04');

    // fndds placeholder kept because the entry was not found
    const fndds = JSON.parse(readFileSync(path.join(fixtureDir, 'usda', 'fndds.v1.json'), 'utf8'));
    expect(
      (fndds.SurveyFoods as { x_synthetic?: string }[]).some(
        (r) => r.x_synthetic === 'golden-placeholder',
      ),
    ).toBe(true);

    // permanent rule rows survive in foundation v1, and v2 is derived again
    const f1 = JSON.parse(
      readFileSync(path.join(fixtureDir, 'usda', 'foundation.v1.json'), 'utf8'),
    );
    const f2 = JSON.parse(
      readFileSync(path.join(fixtureDir, 'usda', 'foundation.v2.json'), 'utf8'),
    );
    const rules1 = (f1.FoundationFoods as { x_synthetic?: string }[]).filter(
      (r) => r.x_synthetic === 'rule-row',
    );
    expect(rules1.length).toBeGreaterThan(20);
    const refs2 = (f2.FoundationFoods as { ndbNumber: unknown }[]).map((r) => r.ndbNumber);
    expect(refs2).not.toContain('synthetic-remove-me');

    // manifests point at the real release
    const m = JSON.parse(readFileSync(path.join(fixtureDir, 'manifest.v1.json'), 'utf8'));
    expect(
      m.inputs.find((i: { dataset: string }) => i.dataset === 'usda_sr_legacy').releaseLabel,
    ).toBe('fixture-2018-04');
    expect(m.meta.provenance).toContain('2026-01-01');
  });

  it('does not complain about nutrient names when the real names match the map', async () => {
    const named = (id: number, number: string, name: string, unit: string, amount: number) => ({
      nutrient: { id, number, name, unitName: unit },
      amount,
    });
    const rec = {
      ...foundationRecord({ fdcId: 3, ndbNumber: 5, description: 'Named properly', nutrients: [] }),
      foodNutrients: [
        named(1008, '208', 'Energy', 'KCAL', 87),
        named(1062, '268', 'Energy', 'kJ', 364),
        named(1003, '203', 'Protein', 'G', 5),
        named(1004, '204', 'Total lipid (fat)', 'G', 3),
        named(1005, '205', 'Carbohydrate, by difference', 'G', 10),
        named(1079, '291', 'Fiber, total dietary', 'G', 1),
        named(2000, '269.3', 'Total Sugars', 'G', 2),
        named(1258, '606', 'Fatty acids, total saturated', 'G', 1),
        named(1093, '307', 'Sodium, Na', 'MG', 100),
        named(1018, '221', 'Alcohol, ethyl', 'G', 0),
      ],
    };
    writeFileSync(
      path.join(downloads, 'FoodData_Central_foundation_food_json_2025-12-18.json'),
      JSON.stringify({ FoundationFoods: [rec] }),
    );
    const result = await cutFixture({
      from: downloads,
      idsFile: path.join(fixtureDir, 'fixture-ids.json'),
      fixtureDir,
      rules: loadConfig().rules,
      version: 'test',
      contact: undefined,
      log: () => undefined,
    });
    expect(result.reports.find((r) => r.dataset === 'usda_foundation')?.nutrientNameIssues).toEqual(
      [],
    );
  });

  it('finds the right file in a folder and ignores Branded and CSV', async () => {
    writeFileSync(path.join(downloads, 'FoodData_Central_branded_food_json_2025-12-18.json'), '{}');
    writeFileSync(path.join(downloads, 'FoodData_Central_foundation_food_csv_2025-12-18.zip'), '');
    expect(await findInputFile(downloads, 'usda_foundation')).toMatch(/foundation_food_json/);
    expect(await findInputFile(downloads, 'usda_sr_legacy')).toMatch(/sr_legacy/);
  });

  it('says what to do by hand when the files cannot be downloaded', async () => {
    const empty = path.join(tmp, 'empty');
    mkdirSync(empty);
    await expect(
      cutFixture({
        from: empty,
        idsFile: path.join(fixtureDir, 'fixture-ids.json'),
        fixtureDir,
        rules: loadConfig().rules,
        version: 'test',
        contact: undefined,
        log: () => undefined,
      }),
    ).rejects.toThrow(/no usda_foundation JSON file found/);
  });
});
