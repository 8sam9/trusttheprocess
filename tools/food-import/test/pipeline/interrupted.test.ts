import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FaultInjectedError } from '../../src/engine/errors.js';
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

/** v1 then a v2 with changes of every kind, so the interrupted run covers inserts, updates and hides. */
async function scenario() {
  const f1 = await ws.foundation('v1.json', foods(1, 30));
  const m1 = await ws.manifest('m1.json', 'full', [
    { path: f1, releaseLabel: 'v1', snapshot: true },
  ]);
  const f2 = await ws.foundation(
    'v2.json',
    foods(1, 36, (n) => (n % 7 === 0 ? { kcal: 90 } : n === 3 ? { protein: 150 } : {})).filter(
      (_, i) => i !== 1 && i !== 29,
    ),
  );
  const m2 = await ws.manifest('m2.json', 'full', [
    { path: f2, releaseLabel: 'v2', snapshot: true },
  ]);
  return { m1, m2 };
}

describe('AC 37 interrupted runs', () => {
  it('a run killed after N batches leaves whole batches only; re-running yields the uninterrupted state', async () => {
    const { m1, m2 } = await scenario();
    // Reference: uninterrupted v1 then v2, with the same small batches.
    await h.run(m1, { batchSize: 4 });
    await h.run(m2, { batchSize: 4 });
    const reference = await tableDigest(db);
    const refRows = (await db.query(`select count(*)::int as n from food.foods`)).rows[0].n;

    for (const n of [0, 1, 2, 3, 4]) {
      await resetFoodTables(db);
      await h.run(m1, { batchSize: 4 });
      const v1Digest = await tableDigest(db);

      await expect(h.run(m2, { batchSize: 4, faultAfterBatches: n })).rejects.toBeInstanceOf(
        FaultInjectedError,
      );
      // killed: the run row stays `running`, rows written so far are whole rows (table constraints held)
      const running = await db.query(
        `select count(*)::int as n from food.import_runs where status = 'running'`,
      );
      expect(running.rows[0].n).toBe(1);
      if (n === 0) expect(await tableDigest(db)).toBe(v1Digest);
      else expect(await tableDigest(db)).not.toBe(reference);

      // the advisory lock died with the connection: a re-run can start, and finishes the job
      const done = await h.run(m2, { batchSize: 4 });
      expect(done.run.status).toBe('succeeded');
      expect(await tableDigest(db), `after fault at ${n}`).toBe(reference);
      expect((await db.query(`select count(*)::int as n from food.foods`)).rows[0].n).toBe(refRows);
      // the killed run is marked aborted by the next run; nothing is left `running`
      const states = await db.query(`select status::text from food.import_runs order by id`);
      expect(states.rows.map((r) => r.status)).toEqual(['succeeded', 'aborted', 'succeeded']);
    }
  });

  it('the fault hook is ignored unless FOOD_IMPORT_FAULT_AFTER_BATCHES reaches the engine via the CLI path', async () => {
    // The engine takes faultAfterBatches only as an option; target.ts decides whether the env var may set it.
    const { faultAfterBatches } = await import('../../src/target.js');
    expect(
      faultAfterBatches({}, { kind: 'local', connectionString: 'x', host: '127.0.0.1' }),
    ).toBeNull();
    expect(() =>
      faultAfterBatches(
        { FOOD_IMPORT_FAULT_AFTER_BATCHES: '2' },
        { kind: 'remote', connectionString: 'x', host: 'h', projectRef: 'r' },
      ),
    ).toThrow(/only honoured with --target local/);
  });
});
