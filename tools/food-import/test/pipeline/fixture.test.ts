import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/cli.js';
import { loadConfig } from '../../src/config.js';
import { runImport } from '../../src/engine/run.js';
import { checkGolden, loadGoldenList } from '../../src/fixture/golden.js';
import { goldenCheck, sizeCheck } from '../../src/fixture/release-check.js';
import { FIXTURE_MANIFEST_V1, FIXTURE_MANIFEST_V2 } from '../../src/fixture/paths.js';
import { Workspace, connect, resetFoodTables, testDbUrl, tableDigest } from './helpers.js';

let db: pg.Client;
let ws: Workspace;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await resetFoodTables(db); // leave the local database empty so food:load-fixture works afterwards
  await db.end();
});
beforeEach(async () => {
  await resetFoodTables(db);
  ws = await Workspace.create();
  // AC 47: loading the fixture needs no network at all
  vi.stubGlobal('fetch', () => {
    throw new Error('network access attempted');
  });
  return async () => ws.cleanup();
});
afterEach(() => vi.unstubAllGlobals());

const apply = (manifestPath: string, extra: Partial<Parameters<typeof runImport>[0]> = {}) =>
  runImport({
    manifestPath,
    apply: true,
    connectionString: testDbUrl(),
    reportDir: ws.reportDir,
    toolVersion: 'test',
    config: loadConfig(),
    ...extra,
  });

const row = async (ref: string) =>
  (
    await db.query(
      `select *, reasons::text[] as reasons_text from food.foods where source_ref = $1`,
      [ref],
    )
  ).rows[0];

describe('AC 47 one-line local load', () => {
  it('pnpm food:load-fixture (the CLI command) fills an empty database without network', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(
      ['load-fixture'],
      { FOOD_IMPORT_LOCAL_DATABASE_URL: testDbUrl() },
      (l) => out.push(l),
      (l) => err.push(l),
    );
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const { rows } = await db.query(
      `select dataset::text, count(*)::int as n from food.foods group by 1 order by 1`,
    );
    expect(rows.map((r) => r.dataset)).toEqual(['usda_fndds', 'usda_foundation', 'usda_sr_legacy']);
    expect(out.join('\n')).toMatch(/Run 1: succeeded/);
  });
});

describe('fixture contents (AC 1, 7 to 23, 42, 46)', () => {
  it('stores each rule row as designed and counts every reject reason', async () => {
    const report = await apply(FIXTURE_MANIFEST_V1);
    expect(report.run.status).toBe('succeeded');

    // AC 1: foods from each USDA generic dataset, with dataset and release
    const per = await db.query(
      `select f.dataset::text, r.label, count(*)::int as n
       from food.foods f join food.releases r on r.id = f.release_id group by 1, 2 order by 1`,
    );
    expect(per.rows.map((r) => r.dataset)).toEqual([
      'usda_fndds',
      'usda_foundation',
      'usda_sr_legacy',
    ]);
    for (const r of per.rows) expect(r.n).toBeGreaterThan(0);

    // AC 19: each reject reason counted under its own code
    const foundation = report.inputs.find((i) => i.dataset === 'usda_foundation')!;
    expect(foundation.rejected).toEqual({
      missing_core: 1,
      negative_value: 1,
      mass_over_100g: 2,
      energy_too_high: 1,
      energy_implausible: 1,
      no_name: 1,
    });
    // AC 20, 21: each soft flag appears
    expect(foundation.flagged).toMatchObject({
      energy_from_kj: 1,
      energy_atwater_mismatch: 1,
      energy_unit_mismatch: 1,
      sugars_over_carbs: 1,
      satfat_over_fat: 1,
      sodium_implausible: 1,
    });

    // AC 8: 1,000 kJ is 239.0 kcal with the flag; both present uses kcal
    const kj = await row('synthetic-kj-only');
    expect(kj.kcal).toBeCloseTo(239.0, 1);
    expect(kj.reasons_text).toEqual(['energy_from_kj']);
    expect(kj.tier).toBe('verified');
    const both = await row('synthetic-kcal-and-kj');
    expect(both.kcal).toBe(250);
    expect(both.reasons_text).toEqual([]);
    // AC 10: unknown is not zero
    const uz = await row('synthetic-unknown-vs-zero');
    expect([uz.fibre_g, uz.sugars_g, uz.satfat_g, uz.sodium_mg]).toEqual([0, 0, null, null]);
    // AC 13: USDA rows are `total`
    expect((await db.query(`select distinct carbs_basis::text from food.foods`)).rows).toEqual([
      { carbs_basis: 'total' },
    ]);
    // AC 17: names
    expect((await row('synthetic-name-messy')).name).toBe('Test messy name');
    expect((await row('synthetic-name-caps')).name).toBe('Test all caps food');
    // AC 18: servings capped at ten, unusable weights dropped, none is fine
    const many = await row('synthetic-servings-many');
    expect(many.servings).toHaveLength(10);
    expect(many.servings.every((s: { grams: number }) => s.grams > 0 && s.grams <= 5000)).toBe(
      true,
    );
    expect((await row('synthetic-no-servings')).servings).toEqual([]);
    // AC 20: alcohol skips the Atwater check; AC 22: all-zero passes untouched
    const alc = await row('synthetic-alcohol');
    expect([alc.tier, alc.reasons_text]).toEqual(['verified', []]);
    const zero = await row('synthetic-all-zero');
    expect([zero.kcal, zero.tier, zero.reasons_text]).toEqual([0, 'verified', []]);
    // AC 21, 23: flagged rows are community, everything else verified, one tier per row
    const tiers = await db.query(
      `select tier::text, count(*)::int as n from food.foods where source_ref like 'synthetic-%' group by 1 order by 1`,
    );
    expect(Object.fromEntries(tiers.rows.map((r) => [r.tier, r.n]))).toEqual({
      community: 5,
      verified: 13,
    });
    expect((await row('synthetic-atwater-flag')).tier).toBe('community');
    // rule rows never carry a barcode (USDA generic)
    expect(
      (await db.query(`select count(*)::int as n from food.foods where barcode is not null`))
        .rows[0].n,
    ).toBe(0);

    // AC 42: provenance on every row
    const prov = await db.query(
      `select count(*)::int as n from food.foods
       where source is null or dataset is null or source_ref is null or release_id is null or last_run_id is null`,
    );
    expect(prov.rows[0].n).toBe(0);
  });
});

describe('AC 48 / 50 golden list on the fixture', () => {
  it('every golden entry is a visible verified food with a plausible energy and its serving', async () => {
    await apply(FIXTURE_MANIFEST_V1);
    const list = await loadGoldenList();
    const results = await checkGolden(db, list);
    const bad = results
      .filter((r) => r.status !== 'pass')
      .map((r) => `${r.entry.referenceName}: ${r.problems.join('; ')}`);
    expect(bad).toEqual([]);
    expect(list.length).toBeGreaterThanOrEqual(100);
    const check = await goldenCheck(db);
    expect(check.ok).toBe(true);
    expect(check.lines[0]).toMatch(/golden: \d+ of \d+ entries pass/);
  });

  it('a name query for each golden entry returns that food among visible results (functional check)', async () => {
    await apply(FIXTURE_MANIFEST_V1);
    const list = await loadGoldenList();
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      for (const entry of list) {
        const res = await db.query<{ source_ref: string; dataset: string }>(
          `select source_ref, dataset::text from public.search_foods($1, 50)`,
          // the baseline RPC accepts queries of up to 100 characters; a few USDA names are longer
          [entry.referenceName.slice(0, 100)],
        );
        expect(
          res.rows.some((r) => r.source_ref === entry.sourceRef && r.dataset === entry.dataset),
          `search "${entry.referenceName}"`,
        ).toBe(true);
      }
    } finally {
      await db.query('rollback');
    }
  });

  it('release-check reports a failure when a golden food is missing or out of range', async () => {
    await apply(FIXTURE_MANIFEST_V1);
    await db.query(`update food.foods set kcal = 400 where source_ref = '1123'`);
    await db.query(
      `update food.foods set hidden_reason = 'removed_upstream' where source_ref = '9040'`,
    );
    const check = await goldenCheck(db);
    expect(check.ok).toBe(false);
    expect(check.lines.join('\n')).toMatch(/Egg, whole, raw, fresh: energy 400 kcal is outside/);
    expect(check.lines.join('\n')).toMatch(/Bananas, raw: hidden \(removed_upstream\)/);
  });

  it('release-check size passes on the fixture and fails over the limit', async () => {
    await apply(FIXTURE_MANIFEST_V1);
    const config = loadConfig();
    expect((await sizeCheck(db, config.budget)).ok).toBe(true);
    const tiny = { ...config.budget, budgetBytes: 1000, hardCeilingBytes: 2000 };
    const failed = await sizeCheck(db, tiny);
    expect(failed.ok).toBe(false);
    expect(failed.lines.join('\n')).toMatch(/FAIL/);
  });
});

describe('fixture updates (AC 30 to 34, 54)', () => {
  it('reload changes nothing; v2 updates, hides and fails in place; v1 again brings them back', async () => {
    const first = await apply(FIXTURE_MANIFEST_V1);
    const before = await tableDigest(db, true);
    const again = await apply(FIXTURE_MANIFEST_V1);
    for (const d of again.inputs)
      expect([d.insertedNew, d.updated, d.hidden, d.unhidden]).toEqual([0, 0, 0, 0]);
    expect(await tableDigest(db, true)).toBe(before);
    const idBefore = (await row('synthetic-update-me')).id;

    const v2 = await apply(FIXTURE_MANIFEST_V2);
    expect(v2.run.status).toBe('succeeded');
    const updated = await row('synthetic-update-me');
    expect(updated.id).toBe(idBefore);
    expect(updated.kcal).toBe(90);
    const removed = await row('synthetic-remove-me');
    expect(removed.hidden_reason).toBe('removed_upstream');
    const broke = await row('synthetic-break-me');
    expect(broke.hidden_reason).toBe('mass_over_100g');
    expect(broke.protein_g).toBe(5); // last good values kept
    // hidden rows still resolve by id (AC 33)
    const byId = await db.query(`select hidden from public.get_foods($1::uuid[])`, [
      [removed.id, broke.id],
    ]);
    expect(byId.rows).toEqual([{ hidden: true }, { hidden: true }]);
    // AC 54: exactly the rows this run changed
    const changed = await db.query(
      `select source_ref from food.foods where last_run_id = $1 order by 1`,
      [v2.run.id],
    );
    expect(changed.rows.map((r) => r.source_ref)).toEqual([
      'synthetic-break-me',
      'synthetic-remove-me',
      'synthetic-update-me',
    ]);

    const back = await apply(FIXTURE_MANIFEST_V1);
    expect(back.inputs.find((i) => i.dataset === 'usda_foundation')!.unhidden).toBe(2);
    expect((await row('synthetic-remove-me')).hidden_reason).toBeNull();
    expect((await row('synthetic-update-me')).kcal).toBe(87);
    expect(first.run.id).toBe(1);
  });

  it('the manifests resolve their files relative to the manifest, whatever the working directory', async () => {
    const m = JSON.parse(await readFile(FIXTURE_MANIFEST_V1, 'utf8'));
    expect(path.isAbsolute(m.inputs[0].path)).toBe(false);
  });
});
