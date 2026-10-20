import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { RunReport } from '../../src/schemas/report.js';
import { ImportError } from '../../src/engine/errors.js';
import {
  Workspace,
  connect,
  foods,
  harness,
  resetFoodTables,
  synthFood,
  tableDigest,
  type Harness,
} from './helpers.js';

let db: pg.Client;
let ws: Workspace;
let h: Harness;

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
  h = harness(ws);
  return async () => ws.cleanup();
});

async function v1(): Promise<string> {
  const file = await ws.foundation('v1.json', foods(1, 20));
  return ws.manifest('m1.json', 'full', [{ path: file, releaseLabel: 'v1', snapshot: true }]);
}

const idOf = async (n: number) =>
  (
    await db.query<{ id: string }>(`select id from food.foods where source_ref = $1`, [
      String(7000 + n),
    ])
  ).rows[0]?.id;

describe('AC 30 idempotent', () => {
  it('a second identical run inserts, updates and hides nothing and moves no marker', async () => {
    const manifest = await v1();
    const first = await h.run(manifest);
    expect(first.run.status).toBe('succeeded');
    expect(first.inputs[0]!.insertedNew).toBe(20);

    const before = await tableDigest(db, true);
    const second = await h.run(manifest);
    const d = second.inputs[0]!;
    expect([d.insertedNew, d.updated, d.hidden, d.unhidden, d.unchanged]).toEqual([0, 0, 0, 0, 20]);
    // whole table including updated_at, last_run_id and created_at is byte-identical
    expect(await tableDigest(db, true)).toBe(before);
    const { rows } = await db.query(`select count(*)::int as n from food.import_runs`);
    expect(rows[0].n).toBe(2);
  });
});

describe('AC 31 update in place', () => {
  it('keeps the id, carries new values and a later marker, creates no second row', async () => {
    await h.run(await v1());
    const id = await idOf(1);
    const before = (
      await db.query(`select kcal, updated_at, created_at from food.foods where id = $1`, [id])
    ).rows[0];
    const file = await ws.foundation(
      'v2.json',
      foods(1, 20, (n) => (n === 1 ? { kcal: 90 } : {})),
    );
    const m2 = await ws.manifest('m2.json', 'full', [
      { path: file, releaseLabel: 'v2', snapshot: true },
    ]);
    const report = await h.run(m2);
    expect(report.inputs[0]!.updated).toBe(1);
    const after = (
      await db.query(`select kcal, updated_at, created_at from food.foods where id = $1`, [id])
    ).rows[0];
    expect(after.kcal).toBe(90);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(after.created_at.getTime()).toBe(before.created_at.getTime());
    expect((await db.query(`select count(*)::int as n from food.foods`)).rows[0].n).toBe(20);
    // the new release is recorded for the changed row; an unchanged row keeps the first one
    const rel = await db.query(
      `select label from food.releases r join food.foods f on f.release_id = r.id where f.id = $1`,
      [id],
    );
    expect(rel.rows[0].label).toBe('v2');
    const other = await db.query(
      `select label from food.releases r join food.foods f on f.release_id = r.id where f.id = $1`,
      [await idOf(5)],
    );
    expect(other.rows[0].label).toBe('v1');
  });
});

describe('AC 33, 34, 35, 54: removal, newly failing, partial, changed rows', () => {
  it('hides absent foods in a snapshot, keeps them readable by id, un-hides on return; newly failing hide with values kept', async () => {
    await h.run(await v1());
    const id2 = (await idOf(2))!;
    const id3 = (await idOf(3))!;
    const before3 = (await db.query(`select kcal, protein_g from food.foods where id = $1`, [id3]))
      .rows[0];

    // v2: food 2 removed, food 3 now fails a reject rule, food 1 changed, food 21 new
    const recs = foods(1, 21, (n) =>
      n === 1 ? { kcal: 90 } : n === 3 ? { protein: 150 } : {},
    ).filter((_, i) => i !== 1);
    const file = await ws.foundation('v2.json', recs);
    const m2 = await ws.manifest('m2.json', 'full', [
      { path: file, releaseLabel: 'v2', snapshot: true },
    ]);
    const r2 = await h.run(m2, { allowMassRemoval: false });
    const d = r2.inputs[0]!;
    expect(d.hiddenByReason).toEqual({ removed_upstream: 1, mass_over_100g: 1 });
    expect(d.rejected).toEqual({ mass_over_100g: 1 });
    expect(d.insertedNew).toBe(1);
    expect(d.updated).toBe(1);

    const rows = (
      await db.query(
        `select id, hidden_reason::text as hr, is_canonical, kcal, protein_g from food.foods where id = any($1)`,
        [[id2, id3]],
      )
    ).rows;
    const by = Object.fromEntries(rows.map((x) => [x.id, x]));
    expect(by[id2].hr).toBe('removed_upstream');
    expect(by[id3].hr).toBe('mass_over_100g');
    expect(by[id3].is_canonical).toBe(false);
    expect(by[id3].protein_g).toBe(before3.protein_g); // values kept (T12.4)
    // still resolves by id through the public RPC, flagged hidden
    const viaRpc = await db.query(`select id, hidden from public.get_foods($1::uuid[])`, [
      [id2, id3],
    ]);
    expect(viaRpc.rows.map((x) => x.hidden)).toEqual([true, true]);

    // AC 54: exactly the changed rows carry the run id
    const run2 = r2.run.id!;
    const changed = await db.query<{ source_ref: string }>(
      `select source_ref from food.foods where last_run_id = $1 order by source_ref`,
      [run2],
    );
    expect(changed.rows.map((x) => x.source_ref)).toEqual(['7001', '7002', '7003', '7021']);

    // reappearance: v3 has everything valid again
    const f3 = await ws.foundation(
      'v3.json',
      foods(1, 21, (n) => (n === 1 ? { kcal: 90 } : {})),
    );
    const r3 = await h.run(
      await ws.manifest('m3.json', 'full', [{ path: f3, releaseLabel: 'v3', snapshot: true }]),
    );
    expect(r3.inputs[0]!.unhidden).toBe(2);
    expect(r3.inputs[0]!.updated).toBe(2);
    const back = await db.query(
      `select hidden_reason, is_canonical from food.foods where id = any($1)`,
      [[id2, id3]],
    );
    expect(back.rows).toEqual([
      { hidden_reason: null, is_canonical: true },
      { hidden_reason: null, is_canonical: true },
    ]);
  });

  it('a partial run, or a full run without snapshot, hides nothing for absence (AC 35)', async () => {
    await h.run(await v1());
    const small = await ws.foundation('small.json', foods(1, 3));
    const partial = await ws.manifest('p.json', 'partial', [{ path: small, releaseLabel: 'p' }]);
    const r = await h.run(partial);
    expect(r.inputs[0]!.hidden).toBe(0);
    const fullNoSnapshot = await ws.manifest('f.json', 'full', [
      { path: small, releaseLabel: 'p', snapshot: false },
    ]);
    const r2 = await h.run(fullNoSnapshot);
    expect(r2.inputs[0]!.hidden).toBe(0);
    expect(
      (await db.query(`select count(*)::int as n from food.foods where hidden_reason is not null`))
        .rows[0].n,
    ).toBe(0);
  });
});

describe('AC 36 mass-removal guard', () => {
  it('stops before writing, reports why, and proceeds only with the override', async () => {
    await h.run(await v1());
    const half = await ws.foundation('half.json', foods(1, 10));
    const m = await ws.manifest('half-m.json', 'full', [
      { path: half, releaseLabel: 'half', snapshot: true },
    ]);
    const digest = await tableDigest(db, true);
    const runsBefore = (await db.query(`select count(*)::int as n from food.import_runs`)).rows[0]
      .n;

    const stopped = await h.run(m);
    expect(stopped.run.status).toBe('aborted');
    expect(stopped.run.failureReason).toMatch(
      /mass-removal guard.*50\.0%.*usda.*--allow-mass-removal/,
    );
    expect(stopped.checks.massRemoval['usda']).toBeCloseTo(0.5);
    expect(await tableDigest(db, true)).toBe(digest);
    expect((await db.query(`select count(*)::int as n from food.import_runs`)).rows[0].n).toBe(
      runsBefore,
    );

    const forced = await h.run(m, { allowMassRemoval: true });
    expect(forced.run.status).toBe('succeeded');
    expect(forced.inputs[0]!.hidden).toBe(10);
  });

  it('exactly 10 percent is allowed', async () => {
    await h.run(await v1());
    const file = await ws.foundation('v2.json', foods(1, 18));
    const r = await h.run(await ws.manifest('m.json', 'full', [{ path: file, snapshot: true }]));
    expect(r.run.status).toBe('succeeded');
    expect(r.inputs[0]!.hidden).toBe(2);
  });
});

describe('AC 52 dry run', () => {
  it('produces the full report and changes nothing', async () => {
    const manifest = await v1();
    await h.run(manifest);
    const file = await ws.foundation(
      'v2.json',
      foods(1, 21, (n) => (n === 1 ? { kcal: 90 } : {})),
    );
    const m2 = await ws.manifest('m2.json', 'full', [
      { path: file, releaseLabel: 'v2', snapshot: true },
    ]);
    const digest = await tableDigest(db, true);
    const counts = async () =>
      (
        await db.query(
          `select (select count(*) from food.import_runs)::int as runs, (select count(*) from food.releases)::int as rels`,
        )
      ).rows[0];
    const before = await counts();

    const dry = await h.run(m2, { apply: false });
    expect(dry.run.status).toBe('dry_run');
    expect(dry.run.dryRun).toBe(true);
    expect(dry.run.id).toBeNull();
    expect(dry.inputs[0]!.insertedNew).toBe(1);
    expect(dry.inputs[0]!.updated).toBe(1);
    expect(await tableDigest(db, true)).toBe(digest);
    expect(await counts()).toEqual(before);

    // a real run afterwards gives exactly the planned counts
    const real = await h.run(m2);
    expect(real.inputs[0]!.insertedNew).toBe(dry.inputs[0]!.insertedNew);
    expect(real.inputs[0]!.updated).toBe(dry.inputs[0]!.updated);
  });
});

describe('AC 51 run report', () => {
  it('reconciles, persists, and lists examples without record contents', async () => {
    const records = [
      ...foods(1, 150),
      synthFood({ n: 151, protein: 150 }), // mass_over_100g
      synthFood({ n: 152, sugars: 40 }), // sugars_over_carbs (soft flag)
      { fdcId: 'not-a-number', description: 'Broken record' }, // parse error (1 of 153 < 1%)
    ];
    const file = await ws.foundation('mixed.json', records);
    const m = await ws.manifest('mixed-m.json', 'full', [
      { path: file, releaseLabel: 'mixed', snapshot: true },
    ]);
    const report = await h.run(m);
    const d = report.inputs[0]!;
    expect(d.read).toBe(153);
    expect(d.rejected).toEqual({ mass_over_100g: 1 });
    expect(d.parseErrors).toBe(1);
    expect(d.insertedNew).toBe(151);
    expect(d.read).toBe(
      d.insertedNew + d.updated + d.unchanged + 1 /* rejected */ + 0 /* skipped */ + d.parseErrors,
    );
    expect(report.checks.reconciled).toBe(true);
    expect(d.examples['mass_over_100g']).toEqual(['usda_foundation:7151']);
    expect(d.flagged['sugars_over_carbs']).toBe(1);

    // persisted in the database and as a file, in the same shape
    const stored = (
      await db.query(`select status::text as status, report from food.import_runs where id = $1`, [
        report.run.id,
      ])
    ).rows[0];
    expect(stored.status).toBe('succeeded');
    expect(RunReport.parse(stored.report).inputs[0]!.read).toBe(153);
    const files = await readdir(ws.reportDir);
    expect(files).toHaveLength(1);
    const onDisk = RunReport.parse(
      JSON.parse(await readFile(path.join(ws.reportDir, files[0]!), 'utf8')),
    );
    expect(onDisk.run.id).toBe(report.run.id);

    // sizes (AC 6): tiers of visible rows, actual size, free space
    expect(report.perSource['usda']!.foodsByTier).toEqual({ verified: 150, community: 1 });
    expect(report.budget.actualBytes).toBeGreaterThan(0);
    expect(report.budget.estimatedBytes).toBeGreaterThan(0);
    expect(report.budget.actualOverEstimated).not.toBeNull();
    expect(report.budget.freeForUserDataBytes).toBeGreaterThan(0);
    expect(report.run.startedAtUtc).toMatch(/Z$/);
  });

  it('stops before writing when more than 1 percent of records do not parse', async () => {
    const file = await ws.foundation('bad.json', [...foods(1, 10), { fdcId: 1 }, { fdcId: 2 }]);
    const m = await ws.manifest('bad-m.json', 'full', [{ path: file, snapshot: true }]);
    await expect(h.run(m)).rejects.toMatchObject({ code: 'bad_input' });
    expect((await db.query(`select count(*)::int as n from food.foods`)).rows[0].n).toBe(0);
  });

  it('AC 53: report and logs hold no record contents and no identifiers', async () => {
    const m = await v1();
    const report = await h.run(m);
    const text = [...h.logs, JSON.stringify(report)].join('\n');
    expect(text).not.toMatch(/Test pipeline food/); // no food names
    expect(text).not.toMatch(/@/); // no e-mail addresses
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/); // no uuids
    expect(h.logs.length).toBeGreaterThan(0);
  });
});

describe('size guards (spec T2.3)', () => {
  it('aborts before writing when the database ceiling would be passed', async () => {
    const config = loadConfig();
    const tiny = {
      ...config,
      budget: { ...config.budget, budgetBytes: 1000, hardCeilingBytes: 2000 },
    };
    const report = await h.run(await v1(), { config: tiny });
    expect(report.run.status).toBe('aborted');
    expect(report.run.failureReason).toMatch(/size ceiling/);
    expect((await db.query(`select count(*)::int as n from food.foods`)).rows[0].n).toBe(0);
    expect((await db.query(`select count(*)::int as n from food.import_runs`)).rows[0].n).toBe(0);
  });

  it('marks the run failed when the actual size ends more than 10 percent over budget', async () => {
    const config = loadConfig();
    const small = {
      ...config,
      budget: { ...config.budget, budgetBytes: 1000, hardCeilingBytes: 10 ** 10 },
    };
    const report = await h.run(await v1(), { config: small });
    expect(report.run.status).toBe('failed');
    expect(report.run.failureReason).toMatch(/10% over/);
    const stored = (
      await db.query(`select status::text as s from food.import_runs where id = $1`, [
        report.run.id,
      ])
    ).rows[0];
    expect(stored.s).toBe('failed');
    // the data is there: a failed budget check is a report, not a rollback
    expect((await db.query(`select count(*)::int as n from food.foods`)).rows[0].n).toBe(20);
  });
});

describe('concurrency and privileges', () => {
  it('refuses to run while another import holds the advisory lock; a dry run still works', async () => {
    const manifest = await v1();
    const other = await connect();
    try {
      await other.query(`select pg_advisory_lock(hashtext('ttp.food_import'))`);
      await expect(h.run(manifest)).rejects.toMatchObject({ code: 'lock' });
      const dry = await h.run(manifest, { apply: false });
      expect(dry.run.status).toBe('dry_run');
    } finally {
      await other.query(`select pg_advisory_unlock_all()`);
      await other.end();
    }
    expect((await db.query(`select count(*)::int as n from food.foods`)).rows[0].n).toBe(0);
  });

  it('runs end to end as the least-privilege role food_importer (no delete, no service key)', async () => {
    const r1 = await h.run(await v1(), { setRole: 'food_importer' });
    expect(r1.run.status).toBe('succeeded');
    const file = await ws.foundation(
      'v2.json',
      foods(1, 20, (n) => (n === 2 ? { kcal: 91 } : {})),
    );
    const r2 = await h.run(
      await ws.manifest('m2.json', 'full', [{ path: file, releaseLabel: 'v2', snapshot: true }]),
      {
        setRole: 'food_importer',
      },
    );
    expect(r2.inputs[0]!.updated).toBe(1);
  });
});

describe('manifest errors', () => {
  it('names the problem for an invalid manifest and writes nothing', async () => {
    const file = path.join(ws.dir, 'broken.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      file,
      JSON.stringify({
        mode: 'partial',
        inputs: [{ dataset: 'usda_foundation', path: 'x', releaseLabel: 'r', snapshot: true }],
      }),
    );
    await expect(h.run(file)).rejects.toThrow(/snapshot: true is only allowed in a full run/);
    await expect(h.run(path.join(ws.dir, 'missing.json'))).rejects.toBeInstanceOf(ImportError);
  });
});
