import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import type { RulesConfig } from '../schemas/config.js';
import type { FoodOutcome, ParseFailure } from '../types.js';
import { N, SYNTH_EGG, simpleFood } from '../../test/helpers/synthetic-usda.js';
import { writeZip } from '../../test/helpers/zip.js';
import { UsdaFormatError, readTopLevelKey, readUsdaGeneric, streamUsdaRecords } from './reader.js';
import { USDA_TOP_KEY, detectUsdaDataset, isUsdaGenericDataset } from './schemas.js';

let dir: string;
let rules: RulesConfig;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'food-import-reader-'));
  rules = loadConfig().rules;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const base = [N.kcal(165), N.protein(10), N.carbs(20), N.fat(5)];

function plainJson(topKey: string, records: unknown[], name = 'f.json'): string {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify({ [topKey]: records }));
  return file;
}
async function zipJson(topKey: string, records: unknown[], name = 'f.zip'): Promise<string> {
  const file = path.join(dir, name);
  await writeZip(file, 'FoodData_Central_synthetic.json', [JSON.stringify({ [topKey]: records })]);
  return file;
}
async function collect(it: AsyncIterable<FoodOutcome | ParseFailure>) {
  const out: (FoodOutcome | ParseFailure)[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('dataset detection (AC 1)', () => {
  it('maps top-level keys to datasets', () => {
    expect(detectUsdaDataset('FoundationFoods')).toBe('usda_foundation');
    expect(detectUsdaDataset('SRLegacyFoods')).toBe('usda_sr_legacy');
    expect(detectUsdaDataset('SurveyFoods')).toBe('usda_fndds');
    expect(detectUsdaDataset('BrandedFoods')).toBe('usda_branded');
    expect(detectUsdaDataset('Other')).toBeNull();
    expect(isUsdaGenericDataset('usda_branded')).toBe(false);
    expect(isUsdaGenericDataset('usda_fndds')).toBe(true);
  });
});

describe('reading the three generic datasets from zip and plain JSON (AC 1)', () => {
  it.each([
    ['usda_foundation', 'zip'],
    ['usda_sr_legacy', 'zip'],
    ['usda_fndds', 'zip'],
    ['usda_foundation', 'json'],
  ] as const)('%s (%s) yields candidates tagged with the dataset', async (dataset, kind) => {
    const key = USDA_TOP_KEY[dataset];
    const recs = [
      SYNTH_EGG,
      simpleFood(base, {
        ndbNumber: dataset === 'usda_fndds' ? undefined : 42,
        foodCode: dataset === 'usda_fndds' ? '77' : undefined,
      }),
    ];
    const file = kind === 'zip' ? await zipJson(key, recs) : plainJson(key, recs);
    const out = await collect(readUsdaGeneric(file, dataset, rules));
    expect(out).toHaveLength(2);
    for (const o of out) {
      expect(o.kind).toBe('candidate');
      if (o.kind === 'candidate') {
        expect(o.food.dataset).toBe(dataset);
        expect(o.food.source).toBe('usda');
        expect(o.food.tier).toBe('verified');
      }
    }
  });

  it('counts rejects and parse errors per record without stopping', async () => {
    const file = await zipJson('FoundationFoods', [
      simpleFood(base),
      simpleFood([N.kcal(165), N.protein(10)]), // missing core
      { fdcId: 'not a number', description: 'bad' }, // does not match the pinned shape
      simpleFood(base, { ndbNumber: 6000 }),
    ]);
    const out = await collect(readUsdaGeneric(file, 'usda_foundation', rules));
    expect(out.map((o) => o.kind)).toEqual(['candidate', 'rejected', 'parse_error', 'candidate']);
    const bad = out[2];
    expect(bad).toMatchObject({ kind: 'parse_error', index: 2 });
  });

  it('handles an empty array and records with no portions', async () => {
    expect(
      await collect(readUsdaGeneric(plainJson('FoundationFoods', []), 'usda_foundation', rules)),
    ).toEqual([]);
  });
});

describe('bad input aborts with a message naming the problem (AC 38)', () => {
  it('wrong dataset for the file', async () => {
    const file = plainJson('SRLegacyFoods', [simpleFood(base)]);
    await expect(collect(readUsdaGeneric(file, 'usda_foundation', rules))).rejects.toThrow(
      /top-level key "SRLegacyFoods" \(a usda_sr_legacy file\).*expects "FoundationFoods"/,
    );
  });
  it('unreadable archive', async () => {
    const file = path.join(dir, 'broken.zip');
    writeFileSync(file, 'this is not a zip file at all');
    await expect(readTopLevelKey(file)).rejects.toThrow(UsdaFormatError);
    await expect(readTopLevelKey(file)).rejects.toThrow(/cannot open archive/);
  });
  it('archive without a json entry', async () => {
    const file = path.join(dir, 'nojson.zip');
    await writeZip(file, 'readme.txt', ['hello']);
    await expect(readTopLevelKey(file)).rejects.toThrow(/contains no \.json file/);
  });
  it('missing file, CSV file and invalid JSON', async () => {
    await expect(readTopLevelKey(path.join(dir, 'nope.json'))).rejects.toThrow(/not found/);
    await expect(readTopLevelKey(path.join(dir, 'x.csv'))).rejects.toThrow(/not found|CSV/);
    writeFileSync(path.join(dir, 'x.csv'), 'a,b');
    await expect(readTopLevelKey(path.join(dir, 'x.csv'))).rejects.toThrow(/CSV/);
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{"FoundationFoods": [ {"a": ');
    await expect(
      (async () => {
        for await (const r of streamUsdaRecords(bad, 'usda_foundation')) void r;
      })(),
    ).rejects.toThrow(UsdaFormatError);
    writeFileSync(bad, 'plain text, not json');
    await expect(readTopLevelKey(bad)).rejects.toThrow(UsdaFormatError);
  });
  it('a top-level value that is not an array fails instead of importing nothing', async () => {
    const file = path.join(dir, 'obj.json');
    writeFileSync(file, JSON.stringify({ FoundationFoods: { not: 'an array' } }));
    await expect(
      (async () => {
        for await (const r of streamUsdaRecords(file, 'usda_foundation')) void r;
      })(),
    ).rejects.toThrow(UsdaFormatError);
  });
});
