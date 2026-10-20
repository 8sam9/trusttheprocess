import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { canonicalJson, contentHash } from '../hash.js';
import { estimateBytes, segmentOf } from '../estimate.js';
import { foodId } from '../identity.js';
import { RunReport } from '../schemas/report.js';
import type { NormalisedFood } from '../types.js';
import { formatReport } from './print.js';

function food(over: Partial<NormalisedFood> = {}): NormalisedFood {
  return {
    id: foodId('usda_sr_legacy', '1123'),
    source: 'usda',
    dataset: 'usda_sr_legacy',
    sourceRef: '1123',
    upstreamId: '171287',
    name: 'Egg, whole, raw, fresh',
    nameLang: 'en',
    altNames: null,
    brand: null,
    barcode: null,
    barcodeRestricted: false,
    markets: [],
    kcal: 143,
    proteinG: 12.56,
    carbsG: 0.72,
    fatG: 9.51,
    fibreG: 0,
    sugarsG: null,
    satfatG: 3.13,
    sodiumMg: 142,
    carbsBasis: 'total',
    tier: 'verified',
    reasons: [],
    servings: [{ label: '1 large', grams: 50 }],
    popularity: null,
    upstreamModifiedAt: '2018-04-01T00:00:00.000Z',
    ...over,
  };
}

describe('content hash (ADR 0007 point 4)', () => {
  it('is stable, ignores key order and the id, and changes with any stored value', () => {
    const a = food();
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as NormalisedFood;
    expect(contentHash(a)).toBe(contentHash(reordered));
    expect(contentHash(a)).toBe(contentHash(food({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })));
    expect(contentHash(a)).not.toBe(contentHash(food({ kcal: 144 })));
    expect(contentHash(a)).not.toBe(contentHash(food({ sugarsG: 0 }))); // unknown is not zero
    expect(contentHash(a)).not.toBe(contentHash(food({ servings: [] })));
    expect(contentHash(a)).not.toBe(contentHash(food({ reasons: ['energy_from_kj'] })));
  });

  it('is a signed 64-bit integer string that Postgres bigint accepts', () => {
    const h = contentHash(food());
    expect(h).toMatch(/^-?\d{1,19}$/);
    const n = BigInt(h);
    expect(n >= -(2n ** 63n) && n < 2n ** 63n).toBe(true);
  });

  it('canonicalJson sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: undefined }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"z":1}]},"b":1}',
    );
  });
});

describe('size estimate (spec T2.3)', () => {
  const budget = loadConfig().budget;
  it('maps datasets and markets to segments', () => {
    expect(segmentOf({ dataset: 'usda_fndds', markets: [] })).toBe('usda_generic');
    expect(segmentOf({ dataset: 'off', markets: ['it'] })).toBe('it');
    expect(segmentOf({ dataset: 'off', markets: ['it', 'us'] })).toBe('us_branded');
    expect(segmentOf({ dataset: 'usda_branded', markets: ['us'] })).toBe('us_branded');
  });

  it('grows with text and servings and never goes negative', () => {
    const small = estimateBytes(food({ name: 'x', servings: [] }), budget);
    const big = estimateBytes(food({ name: 'x'.repeat(100) }), budget);
    expect(big).toBeGreaterThan(small);
    expect(estimateBytes(food({ servings: [] }), budget)).toBeLessThan(
      estimateBytes(food(), budget),
    );
    expect(small).toBeGreaterThanOrEqual(0);
  });
});

describe('run report', () => {
  it('prints counts that reconcile and validates against its schema', () => {
    const report = RunReport.parse({
      run: {
        id: 7,
        mode: 'full',
        dryRun: false,
        startedAtUtc: '2026-10-20T10:00:00.000Z',
        finishedAtUtc: '2026-10-20T10:00:02.000Z',
        durationSeconds: 2,
        toolVersion: '0.1.0',
        status: 'succeeded',
      },
      inputs: [
        {
          source: 'usda',
          dataset: 'usda_sr_legacy',
          releaseLabel: '2018-04',
          fileSha256: 'a'.repeat(64),
          read: 10,
          insertedNew: 6,
          updated: 1,
          unchanged: 1,
          hidden: 0,
          hiddenByReason: {},
          unhidden: 0,
          flagged: { energy_from_kj: 1 },
          rejected: { missing_core: 1 },
          skippedBySelection: { superseded: 1 },
          parseErrors: 0,
          examples: { missing_core: ['usda_sr_legacy:1'] },
        },
      ],
      perSource: {
        usda: { foodsByTier: { verified: 7 }, clustersCreated: 0, clustersChangedCanonical: 0 },
      },
      budget: {
        budgetBytes: 314572800,
        targetBytes: 283115520,
        estimatedBytes: 1000,
        actualBytes: 2000,
        actualOverEstimated: 2,
        droppedForBudget: {},
        dbTotalBytes: 9000000,
        freeForUserDataBytes: 500000000,
        deadTuples: 0,
      },
      checks: { reconciled: true, massRemoval: { usda: 0 }, parseErrorRate: 0 },
    });
    const text = formatReport(report).join('\n');
    expect(text).toContain(
      'read 10 = new 6 + updated 1 + unchanged 1 + rejected 1 + skipped 1 + parse errors 0',
    );
    expect(text).toContain('rejected: missing_core=1');
    expect(text).toContain('usda: visible by tier verified=7');
    expect(text).not.toMatch(/Egg|@/);
  });
});
