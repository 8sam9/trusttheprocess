import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { writeZip } from '../helpers/zip.js';
import {
  Workspace,
  connect,
  foods,
  harness,
  resetFoodTables,
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

async function expectAbortBeforeWrite(manifest: string, message: RegExp) {
  // seed some data so "DB unchanged" is meaningful
  const seed = await ws.foundation('seed.json', foods(1, 3));
  await h.run(await ws.manifest('seed-m.json', 'full', [{ path: seed, releaseLabel: 'seed' }]));
  const digest = await tableDigest(db, true);
  const runs = (await db.query(`select count(*)::int as n from food.import_runs`)).rows[0].n;

  await expect(h.run(manifest)).rejects.toMatchObject({
    code: 'bad_input',
    message: expect.stringMatching(message),
  });

  expect(await tableDigest(db, true)).toBe(digest);
  expect((await db.query(`select count(*)::int as n from food.import_runs`)).rows[0].n).toBe(runs);
}

describe('AC 38 bad input aborts before any write, naming the problem', () => {
  it('a missing expected field', async () => {
    const records = foods(1, 20).map((r) => {
      const { description: _d, ...rest } = r as Record<string, unknown>;
      return rest;
    });
    const file = await ws.foundation('nodesc.json', records);
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: file }]),
      /nodesc\.json.*20 of the first 20.*"description"/,
    );
  });

  it('CSV instead of the JSON dump (wrong format / delimiter)', async () => {
    const file = path.join(ws.dir, 'foods.csv');
    await writeFile(file, 'fdc_id,description\n1,Egg\n');
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: file }]),
      /is CSV; use the JSON dump/,
    );
  });

  it('an unreadable archive', async () => {
    const file = path.join(ws.dir, 'broken.zip');
    await writeFile(file, 'PK\u0003\u0004 this is not a real archive');
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: file }]),
      /broken\.zip/,
    );
  });

  it('a truncated archive fails during planning, still before any write', async () => {
    const file = path.join(ws.dir, 'cut.zip');
    await writeZip(file, 'f.json', [JSON.stringify({ FoundationFoods: foods(1, 5) })]);
    const { readFile } = await import('node:fs/promises');
    const whole = await readFile(file);
    await writeFile(file, whole.subarray(0, Math.floor(whole.length / 2)));
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: file }]),
      /cut\.zip|Nothing was written/,
    );
  });

  it('a file of the wrong dataset (top-level key)', async () => {
    const file = path.join(ws.dir, 'sr.json');
    await writeFile(file, JSON.stringify({ SRLegacyFoods: foods(1, 5) }));
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: file, dataset: 'usda_foundation' }]),
      /top-level key "SRLegacyFoods".*expects "FoundationFoods"/,
    );
  });

  it('a missing file', async () => {
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: path.join(ws.dir, 'nope.json') }]),
      /input file not found/,
    );
  });

  it('a dataset this version cannot read yet, and an OFF non-food file name (AC 5 preflight)', async () => {
    const dir = path.join(ws.dir, 'x');
    await mkdir(dir, { recursive: true });
    const branded = path.join(dir, 'branded.json');
    await writeFile(branded, '{}');
    await expectAbortBeforeWrite(
      await ws.manifest('m.json', 'full', [{ path: branded, dataset: 'usda_branded' }]),
      /not supported by this version/,
    );
    const beauty = path.join(dir, 'openbeautyfacts-products.jsonl');
    await writeFile(beauty, '{}\n');
    await expectAbortBeforeWrite(
      await ws.manifest('m2.json', 'full', [{ path: beauty, dataset: 'off' }]),
      /non-food Open Food Facts file/,
    );
  });
});
