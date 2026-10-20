import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { loadConfig } from '../../src/config.js';
import { runImport, type RunOptions } from '../../src/engine/run.js';
import { LOCAL_DATABASE_URL, assertLoopback } from '../../src/target.js';
import { N, foundationRecord, type SynthNutrient } from '../helpers/synthetic-usda.js';

/** The local database for pipeline tests: CI's `supabase db start`, or the stand-in on another loopback port. */
export function testDbUrl(): string {
  const url =
    process.env['FOOD_IMPORT_TEST_DATABASE_URL'] ??
    process.env['FOOD_IMPORT_LOCAL_DATABASE_URL'] ??
    LOCAL_DATABASE_URL;
  assertLoopback(url);
  return url;
}

export async function connect(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: testDbUrl() });
  await c.connect();
  return c;
}

/**
 * Empties the food tables so every test starts from the same state. This is a TEST-ONLY helper for the local
 * database (loopback is asserted above): it wipes any fixture you loaded, so re-run `pnpm food:load-fixture` after.
 */
export async function resetFoodTables(c: pg.Client): Promise<void> {
  await c.query('truncate food.foods, food.releases, food.import_runs restart identity');
}

/** Digest of the whole table minus run ids and timestamps (AC 37 compares runs that have different run ids). */
export async function tableDigest(c: pg.Client, includeRunColumns = false): Promise<string> {
  const strip = includeRunColumns ? '' : " - 'last_run_id' - 'created_at' - 'updated_at'";
  const { rows } = await c.query<{ d: string }>(
    `select coalesce(md5(string_agg((to_jsonb(f)${strip})::text, E'\\n' order by f.id)), 'empty') as d
     from food.foods f`,
  );
  return rows[0]!.d;
}

export interface FoodSpec {
  n: number;
  kcal?: number;
  protein?: number;
  sugars?: number;
  name?: string;
  extra?: SynthNutrient[];
}

/** A valid Foundation-shaped synthetic record. Values are consistent with Atwater (4*5 + 4*10 + 9*3 = 87). */
export function synthFood(spec: FoodSpec): Record<string, unknown> {
  return foundationRecord({
    fdcId: 800000 + spec.n,
    ndbNumber: 7000 + spec.n,
    description: spec.name ?? `Test pipeline food ${spec.n}`,
    nutrients: [
      N.kcal(spec.kcal ?? 87),
      N.protein(spec.protein ?? 5),
      N.carbs(10),
      N.fat(3),
      N.fibre(1),
      N.sugars(spec.sugars ?? 2),
      N.satfat(1),
      N.sodium(100),
      ...(spec.extra ?? []),
    ],
    portions: [
      {
        amount: 1,
        gramWeight: 40,
        modifier: 'slice',
        sequenceNumber: 1,
        measureUnit: { name: 'undetermined' },
      },
    ],
  });
}

export function foods(
  from: number,
  to: number,
  tweak: (n: number) => Partial<FoodSpec> = () => ({}),
) {
  const out: Record<string, unknown>[] = [];
  for (let n = from; n <= to; n += 1) out.push(synthFood({ n, ...tweak(n) }));
  return out;
}

export class Workspace {
  private constructor(readonly dir: string) {}

  static async create(): Promise<Workspace> {
    return new Workspace(await mkdtemp(path.join(os.tmpdir(), 'food-import-test-')));
  }

  async cleanup(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }

  /** Writes `{ FoundationFoods: [...] }` and returns the file path. */
  async foundation(name: string, records: unknown[]): Promise<string> {
    const file = path.join(this.dir, name);
    await writeFile(file, JSON.stringify({ FoundationFoods: records }));
    return file;
  }

  async manifest(
    name: string,
    mode: 'full' | 'partial',
    inputs: { path: string; releaseLabel?: string; snapshot?: boolean; dataset?: string }[],
  ): Promise<string> {
    const file = path.join(this.dir, name);
    await mkdir(this.dir, { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        mode,
        inputs: inputs.map((i) => ({
          dataset: i.dataset ?? 'usda_foundation',
          path: i.path,
          releaseLabel: i.releaseLabel ?? 'test-release',
          snapshot: i.snapshot ?? false,
        })),
      }),
    );
    return file;
  }

  get reportDir(): string {
    return path.join(this.dir, 'reports');
  }
}

export interface Harness {
  logs: string[];
  run(manifestPath: string, opts?: Partial<RunOptions>): ReturnType<typeof runImport>;
}

export function harness(ws: Workspace): Harness {
  const logs: string[] = [];
  return {
    logs,
    run: (manifestPath, opts = {}) =>
      runImport({
        manifestPath,
        apply: true,
        connectionString: testDbUrl(),
        reportDir: ws.reportDir,
        toolVersion: 'test',
        config: loadConfig(),
        log: (l) => logs.push(l),
        ...opts,
      }),
  };
}
