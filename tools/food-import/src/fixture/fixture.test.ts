import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GoldenList, loadGoldenList } from './golden.js';
import {
  FIXTURE_DIR,
  FIXTURE_MANIFEST_V1,
  FIXTURE_MANIFEST_V2,
  FIXTURE_MAX_BYTES,
} from './paths.js';
import { Manifest } from '../schemas/manifest.js';
import { USDA_TOP_KEY } from '../usda/schemas.js';

function sizeOf(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    total += statSync(full).isDirectory() ? sizeOf(full) : statSync(full).size;
  }
  return total;
}

const json = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;

describe('checked-in fixture (AC 46)', () => {
  it('is at most 5 MB in total', () => {
    expect(sizeOf(FIXTURE_DIR)).toBeLessThanOrEqual(FIXTURE_MAX_BYTES);
  });

  it('has a licence file that states provenance for every part', () => {
    const text = readFileSync(path.join(FIXTURE_DIR, 'LICENCES.md'), 'utf8');
    expect(text).toMatch(/public domain/i);
    expect(text).toMatch(/SYNTHETIC/);
    expect(text).toMatch(/ODbL/);
  });

  it('manifests are valid and carry provenance and licence', () => {
    for (const f of [FIXTURE_MANIFEST_V1, FIXTURE_MANIFEST_V2]) {
      const raw = json(f);
      const m = Manifest.parse(raw);
      expect(m.mode).toBe('full');
      expect(m.meta?.['provenance']).toBeTruthy();
      expect(m.meta?.['licence']).toBeTruthy();
      expect(m.inputs.map((i) => i.dataset).sort()).toEqual([
        'usda_fndds',
        'usda_foundation',
        'usda_sr_legacy',
      ]);
    }
  });

  it('every USDA file states its release and licence, and its dataset key comes first', () => {
    for (const [ds, key] of [
      ['foundation.v1', USDA_TOP_KEY.usda_foundation],
      ['foundation.v2', USDA_TOP_KEY.usda_foundation],
      ['sr_legacy.v1', USDA_TOP_KEY.usda_sr_legacy],
      ['fndds.v1', USDA_TOP_KEY.usda_fndds],
    ] as const) {
      const file = path.join(FIXTURE_DIR, 'usda', `${ds}.json`);
      const j = json(file);
      expect(
        Object.keys(j)[0],
        `${ds}: the dataset key must be first (preflight reads the first key)`,
      ).toBe(key);
      const meta = j['_fixture'] as Record<string, unknown>;
      expect(meta['upstreamRelease'], ds).toBeTruthy();
      expect(meta['licence'], ds).toBeTruthy();
      expect(typeof meta['synthetic'], ds).toBe('boolean');
    }
  });

  it('everything that is not real data is clearly marked synthetic (H1)', () => {
    for (const ds of ['foundation.v1', 'foundation.v2', 'sr_legacy.v1', 'fndds.v1']) {
      const j = json(path.join(FIXTURE_DIR, 'usda', `${ds}.json`));
      const key = Object.keys(j)[0] as string;
      const meta = j['_fixture'] as { synthetic: boolean };
      const records = j[key] as Record<string, unknown>[];
      expect(records.length).toBeGreaterThan(0);
      for (const r of records) {
        const tag = r['x_synthetic'];
        if (meta.synthetic) expect(tag, `${ds} ${String(r['description'])}`).toBeTruthy();
        if (tag === 'rule-row') {
          expect(String(r['ndbNumber'])).toMatch(/^synthetic-/);
          expect(
            String(r['description']).trim() === '' ||
              /^\s*Test|^\s*TEST/.test(String(r['description'])),
          ).toBe(true);
        }
        if (tag === 'golden-placeholder')
          expect(Number(r['fdcId'])).toBeGreaterThanOrEqual(9_000_000);
      }
    }
  });
});

describe('golden list (AC 48, spec Q12)', () => {
  it('has about 100 foods plus the Italian staples, valid and unique', async () => {
    const list = await loadGoldenList();
    expect(GoldenList.safeParse(list).success).toBe(true);
    const italian = list.filter((e) => e.group === 'italian');
    expect(list.length - italian.length).toBeGreaterThanOrEqual(90);
    expect(italian.length).toBeGreaterThanOrEqual(15);
    const names = list.map((e) => e.referenceName.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('names the foods the spec lists', async () => {
    const names = (await loadGoldenList()).map((e) => e.referenceName.toLowerCase()).join('\n');
    for (const word of [
      'egg, whole',
      'banana',
      'rice, white',
      'chicken',
      'milk, whole',
      'olive',
      'oats',
      'bread, white',
      'apples',
      'cheddar',
      'butter',
      'salmon',
      'potatoes',
      'broccoli',
      'lentils',
      'peanut butter',
      'coffee',
      'mozzarella',
      'parmesan',
      'ricotta',
      'prosciutto',
      'pasta, cooked',
    ]) {
      expect(names, word).toContain(word);
    }
  });

  it('rejects a bad range and duplicates', () => {
    const e = { dataset: 'usda_sr_legacy', sourceRef: '1', referenceName: 'x', kcalRange: [5, 1] };
    expect(GoldenList.safeParse([e]).success).toBe(false);
    const ok = { ...e, kcalRange: [1, 5] };
    expect(GoldenList.safeParse([ok, ok]).success).toBe(false);
  });
});
