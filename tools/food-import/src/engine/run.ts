import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { FoodHiddenReason, type FoodSource } from '@ttp/shared';
import { loadConfig } from '../config.js';
import { contentHash } from '../hash.js';
import { estimateBytes } from '../estimate.js';
import type { ImporterConfig } from '../schemas/config.js';
import { Manifest, type ManifestInput } from '../schemas/manifest.js';
import { RunReport, type DatasetReport } from '../schemas/report.js';
import type { NormalisedFood } from '../types.js';
import { UsdaFormatError } from '../usda/reader.js';
import {
  HIDE_SQL,
  UPSERT_SQL,
  canonicalByBarcode,
  foodsByTier,
  measureSizes,
  readStoredFoods,
  toDbRecord,
  visibleBySource,
  type StoredFood,
} from './db.js';
import { FaultInjectedError, ImportError } from './errors.js';
import { WorkFileWriter, readWorkFile, sha256File } from './files.js';
import { PARSE_ERROR_LIMIT, datasetSource, openInput } from './inputs.js';

export const MASS_REMOVAL_LIMIT = 0.1;
/** Supabase Free plan database size (spec Q1); used only to report free space for user data. */
export const FREE_PLAN_BYTES = 500 * 1024 * 1024;
const ADVISORY_LOCK_KEY = 'ttp.food_import';
const EXAMPLES_PER_REASON = 20;

export interface RunOptions {
  /** Path of the manifest JSON; input paths in it are relative to its directory. */
  manifestPath: string;
  /** Without apply the run is a dry run: the report is produced, the database is not changed (AC 52). */
  apply: boolean;
  connectionString: string;
  allowMassRemoval?: boolean;
  reportDir: string;
  throttleMs?: number;
  toolVersion: string;
  /** Test hook (AC 37): simulate a killed process after this many committed write batches. */
  faultAfterBatches?: number | null;
  /** Rows per write transaction (default 1,000, ADR 0007). */
  batchSize?: number;
  /** Run the session as this role (for example food_importer) to prove least privilege. */
  setRole?: string;
  config?: ImporterConfig;
  workDir?: string;
  log?: (line: string) => void;
  now?: () => Date;
}

interface IndexEntry {
  seq: number;
  hash: string;
  est: number;
  reasons: readonly string[];
  modified: string | null;
  fdcId: number;
}

interface Planned {
  input: ManifestInput;
  absPath: string;
  report: DatasetReport;
  index: Map<string, IndexEntry>;
  rejects: Map<string, string>;
  seen: Set<string>;
  workFile: string;
  actions: Map<string, 'insert' | 'update'>;
}

function inc(counts: Record<string, number>, key: string, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

function example(report: DatasetReport, reason: string, label: string): void {
  const list = (report.examples[reason] ??= []);
  if (list.length < EXAMPLES_PER_REASON) list.push(label);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Later publication wins; then the higher fdcId; otherwise the first seen stays (deterministic). */
function newerWins(prev: IndexEntry, next: { modified: string | null; fdcId: number }): boolean {
  const a = prev.modified ?? '';
  const b = next.modified ?? '';
  if (a !== b) return b > a;
  return next.fdcId > prev.fdcId;
}

export async function runImport(opts: RunOptions): Promise<RunReport> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? (() => new Date());
  const config = opts.config ?? loadConfig();
  const started = now();
  const batchSize = opts.batchSize ?? 1000;
  const dryRun = !opts.apply;

  // ---- manifest and preflight: nothing touches the database yet (AC 5, 38) -------------------------------------
  let manifest: Manifest;
  try {
    const raw = JSON.parse(await readFile(opts.manifestPath, 'utf8')) as unknown;
    const parsed = Manifest.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ImportError(
        'bad_input',
        `manifest ${opts.manifestPath}: ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`,
      );
    }
    manifest = parsed.data;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(
      'bad_input',
      `cannot read manifest ${opts.manifestPath}: ${(e as Error).message}`,
    );
  }

  const planned: Planned[] = [];
  const workDir =
    opts.workDir ??
    path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      '..',
      '.work',
      `${started.getTime()}-${process.pid}`,
    );
  for (const input of manifest.inputs) {
    const absPath = path.resolve(path.dirname(opts.manifestPath), input.path);
    const reader = openInput(input, absPath, config);
    await reader.preflight();
    planned.push({
      input,
      absPath,
      report: {
        source: datasetSource(input.dataset),
        dataset: input.dataset,
        releaseLabel: input.releaseLabel,
        fileSha256: '',
        read: 0,
        insertedNew: 0,
        updated: 0,
        unchanged: 0,
        hidden: 0,
        hiddenByReason: {},
        unhidden: 0,
        flagged: {},
        rejected: {},
        skippedBySelection: {},
        parseErrors: 0,
        examples: {},
      },
      index: new Map(),
      rejects: new Map(),
      seen: new Set(),
      workFile: path.join(workDir, `${input.dataset}.ndjson.gz`),
      actions: new Map(),
    });
  }

  const db = new pg.Client({ connectionString: opts.connectionString });
  let lockHeld = false;
  let runId: number | null = null;
  try {
    try {
      await db.connect();
    } catch (e) {
      throw new ImportError('database', `cannot connect to the database: ${(e as Error).message}`);
    }
    if (opts.setRole !== undefined) await db.query(`set role ${pg.escapeIdentifier(opts.setRole)}`);

    if (!dryRun) {
      const got = await db.query<{ ok: boolean }>(
        `select pg_try_advisory_lock(hashtext($1)) as ok`,
        [ADVISORY_LOCK_KEY],
      );
      if (!got.rows[0]?.ok) {
        throw new ImportError(
          'lock',
          'another food import is running (advisory lock ttp.food_import is held). Wait for it to finish, then re-run.',
        );
      }
      lockHeld = true;
    }

    // ---- plan phase, step 1: stream, normalise, write candidates to the work file -----------------------------
    let totalRead = 0;
    let totalParseErrors = 0;
    for (const p of planned) {
      p.report.fileSha256 = await sha256File(p.absPath);
      const writer = await WorkFileWriter.open(p.workFile);
      let seq = 0;
      const reader = openInput(p.input, p.absPath, config);
      try {
        for await (const outcome of reader.read()) {
          p.report.read += 1;
          if (outcome.kind === 'parse_error') {
            p.report.parseErrors += 1;
            example(p.report, 'parse_error', `${p.input.dataset}#${outcome.index}`);
            continue;
          }
          if (outcome.kind === 'rejected') {
            inc(p.report.rejected, outcome.reason);
            example(p.report, outcome.reason, `${outcome.ref.dataset}:${outcome.ref.sourceRef}`);
            p.seen.add(outcome.ref.id);
            p.rejects.set(outcome.ref.id, outcome.reason);
            continue;
          }
          if (outcome.kind === 'skipped') {
            inc(p.report.skippedBySelection, outcome.reason);
            if (outcome.ref) p.seen.add(outcome.ref.id);
            continue;
          }
          const food = outcome.food;
          p.seen.add(food.id);
          const next = {
            modified: food.upstreamModifiedAt,
            fdcId: Number(food.upstreamId ?? 0) || 0,
          };
          const prev = p.index.get(food.id);
          if (prev && !newerWins(prev, next)) {
            inc(p.report.skippedBySelection, 'superseded');
            example(p.report, 'superseded', `${food.dataset}:${food.sourceRef}`);
            continue;
          }
          if (prev) {
            inc(p.report.skippedBySelection, 'superseded');
            example(p.report, 'superseded', `${food.dataset}:${food.sourceRef}`);
          }
          seq += 1;
          const hash = contentHash(food);
          p.index.set(food.id, {
            seq,
            hash,
            est: estimateBytes(food, config.budget),
            reasons: food.reasons,
            ...next,
          });
          await writer.write({ seq, hash, food });
        }
      } catch (e) {
        if (e instanceof UsdaFormatError) {
          throw new ImportError('bad_input', `${e.message}. Nothing was written.`);
        }
        throw e;
      } finally {
        await writer.close();
      }
      for (const id of p.index.keys()) p.rejects.delete(id);
      totalRead += p.report.read;
      totalParseErrors += p.report.parseErrors;
      log(
        `plan ${p.input.dataset}: ${p.report.read} read, ${p.index.size} candidates, ${p.rejects.size} rejected`,
      );
    }
    const parseErrorRate = totalRead === 0 ? 0 : totalParseErrors / totalRead;

    // ---- steps 2 to 4: read DB state and diff -------------------------------------------------------------------
    const datasets = planned.map((p) => p.input.dataset);
    const stored = await readStoredFoods(db, datasets);
    const visible = await visibleBySource(db);
    const hides = new Map<string, string[]>(); // reason -> ids
    const hidesBySource: Record<string, number> = {};
    let estimatedBytes = 0;
    let estimatedNewBytes = 0;

    for (const p of planned) {
      const r = p.report;
      for (const [id, entry] of p.index) {
        estimatedBytes += entry.est;
        for (const code of entry.reasons) inc(r.flagged, code);
        const row: StoredFood | undefined = stored.get(id);
        if (!row) {
          p.actions.set(id, 'insert');
          r.insertedNew += 1;
          estimatedNewBytes += entry.est;
        } else if (row.hash !== entry.hash || row.hidden !== null) {
          p.actions.set(id, 'update');
          r.updated += 1;
          if (row.hidden !== null) r.unhidden += 1;
        } else {
          r.unchanged += 1;
        }
      }
      const hide = (id: string, reason: string, wasVisible: boolean) => {
        const list = hides.get(reason) ?? [];
        list.push(id);
        hides.set(reason, list);
        if (wasVisible) {
          r.hidden += 1;
          inc(r.hiddenByReason, reason);
          inc(hidesBySource, r.source);
        }
      };
      // AC 34: newly failing rows are hidden with their reason; values are kept (T12.4).
      for (const [id, reason] of p.rejects) {
        const row = stored.get(id);
        if (row && row.hidden !== reason) hide(id, reason, row.hidden === null);
      }
      // AC 33, 35: absence hides only in a full run, only for a snapshot input.
      if (manifest.mode === 'full' && p.input.snapshot) {
        for (const [id, row] of stored) {
          if (row.dataset === p.input.dataset && row.hidden === null && !p.seen.has(id)) {
            hide(id, 'removed_upstream', true);
          }
        }
      }
    }

    // ---- step 5: guards, all before the first write -------------------------------------------------------------
    const massRemoval: Record<string, number> = {};
    for (const source of new Set(planned.map((p) => p.report.source))) {
      const total = visible[source] ?? 0;
      massRemoval[source] = total === 0 ? 0 : (hidesBySource[source] ?? 0) / total;
    }
    const reconciled = planned.every((p) => {
      const r = p.report;
      const sum =
        r.insertedNew +
        r.updated +
        r.unchanged +
        Object.values(r.rejected).reduce((a, b) => a + b, 0) +
        Object.values(r.skippedBySelection).reduce((a, b) => a + b, 0) +
        r.parseErrors;
      return sum === r.read;
    });
    const sizesBefore = await measureSizes(db);

    let abort: string | null = null;
    if (!reconciled) {
      abort =
        'row counts do not reconcile (rows read differs from the sum of outcomes); nothing was written';
    } else if (parseErrorRate > PARSE_ERROR_LIMIT) {
      abort = `${(parseErrorRate * 100).toFixed(2)}% of records did not match the expected shape (limit ${PARSE_ERROR_LIMIT * 100}%); the upstream format may have changed. Nothing was written.`;
    } else {
      const over = Object.entries(massRemoval).find(([, ratio]) => ratio > MASS_REMOVAL_LIMIT);
      if (over && !opts.allowMassRemoval) {
        abort = `mass-removal guard: this run would hide ${(over[1] * 100).toFixed(1)}% of the visible ${over[0]} foods (limit ${MASS_REMOVAL_LIMIT * 100}%). The input may be truncated. Check the file, or re-run with --allow-mass-removal if the removal is expected. Nothing was written.`;
      } else if (sizesBefore.dbTotalBytes + estimatedNewBytes > config.budget.hardCeilingBytes) {
        abort = `size ceiling: database ${sizesBefore.dbTotalBytes} bytes plus ${estimatedNewBytes} bytes of new rows would pass the ${config.budget.hardCeilingBytes} byte ceiling. Nothing was written.`;
      }
    }

    const finish = async (
      status: RunReport['run']['status'],
      failureReason: string | undefined,
      sizes: Awaited<ReturnType<typeof measureSizes>>,
      perSource: RunReport['perSource'],
    ): Promise<RunReport> => {
      const finished = now();
      const covers = sizes.datasetsInDb.every((d) => datasets.includes(d as never));
      const report: RunReport = RunReport.parse({
        run: {
          id: runId,
          mode: manifest.mode,
          dryRun,
          startedAtUtc: started.toISOString(),
          finishedAtUtc: finished.toISOString(),
          durationSeconds: Math.max(0, (finished.getTime() - started.getTime()) / 1000),
          toolVersion: opts.toolVersion,
          status,
          ...(failureReason === undefined ? {} : { failureReason }),
        },
        inputs: planned.map((p) => p.report),
        perSource,
        budget: {
          budgetBytes: config.budget.budgetBytes,
          targetBytes: Math.round(config.budget.budgetBytes * config.budget.targetFraction),
          estimatedBytes,
          actualBytes: sizes.actualBytes,
          actualOverEstimated:
            covers && estimatedBytes > 0 && sizes.actualBytes > 0
              ? Number((sizes.actualBytes / estimatedBytes).toFixed(3))
              : null,
          droppedForBudget: {},
          dbTotalBytes: sizes.dbTotalBytes,
          freeForUserDataBytes: Math.max(0, FREE_PLAN_BYTES - sizes.dbTotalBytes),
          deadTuples: sizes.deadTuples,
        },
        checks: { reconciled, massRemoval, parseErrorRate },
      });
      await mkdir(opts.reportDir, { recursive: true });
      const stamp = report.run.startedAtUtc.replace(/[:.]/g, '-');
      const file = path.join(
        opts.reportDir,
        `run-${stamp}-${dryRun ? 'dry' : (runId ?? 'aborted')}.json`,
      );
      await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
      log(`report written to ${file}`);
      return report;
    };

    const tierNow = async (): Promise<RunReport['perSource']> => {
      const tiers = await foodsByTier(db);
      const out: RunReport['perSource'] = {};
      for (const source of ['usda', 'off'] as const) {
        out[source] = {
          foodsByTier: (tiers[source] ?? {}) as Record<'verified' | 'brand' | 'community', number>,
          clustersCreated: 0,
          clustersChangedCanonical: 0,
        };
      }
      return out;
    };

    if (abort !== null) {
      log(`aborted before any write: ${abort}`);
      return await finish('aborted', abort, sizesBefore, await tierNow());
    }
    if (dryRun) {
      log('dry run: the database was not changed');
      return await finish('dry_run', undefined, sizesBefore, await tierNow());
    }

    // ---- apply phase ----------------------------------------------------------------------------------------------
    // A run left `running` by a killed process is marked aborted (we hold the lock, so nobody else is running).
    await db.query(
      `update food.import_runs set status = 'aborted', finished_at = now() where status = 'running'`,
    );
    const releaseIds = new Map<string, number>();
    for (const p of planned) {
      const rel = await db.query<{ id: number }>(
        `insert into food.releases (dataset, label, file_sha256) values ($1::food.dataset, $2, $3)
         on conflict (dataset, label, file_sha256) do update set label = excluded.label returning id`,
        [p.input.dataset, p.input.releaseLabel, p.report.fileSha256],
      );
      const releaseId = rel.rows[0]?.id;
      if (releaseId === undefined)
        throw new ImportError('database', 'could not record the release');
      releaseIds.set(p.input.dataset, releaseId);
    }
    const run = await db.query<{ id: number }>(
      `insert into food.import_runs (mode, tool_version) values ($1, $2) returning id`,
      [manifest.mode, opts.toolVersion],
    );
    const newRunId = run.rows[0]?.id;
    if (newRunId === undefined) throw new ImportError('database', 'could not record the run');
    runId = newRunId;
    log(`run ${runId} started (${manifest.mode})`);

    const canonicalBefore = await canonicalByBarcode(db);
    let batches = 0;
    const beforeBatch = async () => {
      if (opts.faultAfterBatches != null && batches >= opts.faultAfterBatches) {
        throw new FaultInjectedError(opts.faultAfterBatches);
      }
    };
    const afterBatch = async () => {
      batches += 1;
      if ((opts.throttleMs ?? 0) > 0) await sleep(opts.throttleMs ?? 0);
    };
    const inTransaction = async (fn: () => Promise<void>) => {
      await db.query('begin');
      try {
        await fn();
        await db.query('commit');
      } catch (e) {
        await db.query('rollback');
        throw e;
      }
    };

    try {
      for (const p of planned) {
        let batch: Record<string, unknown>[] = [];
        const flush = async () => {
          if (batch.length === 0) return;
          await beforeBatch();
          const rows = batch;
          batch = [];
          await inTransaction(async () => {
            await db.query(UPSERT_SQL, [
              JSON.stringify(rows),
              releaseIds.get(p.input.dataset),
              runId,
            ]);
          });
          await afterBatch();
        };
        if (p.actions.size > 0) {
          for await (const line of readWorkFile<{
            seq: number;
            hash: string;
            food: NormalisedFood;
          }>(p.workFile)) {
            const entry = p.index.get(line.food.id);
            if (!entry || entry.seq !== line.seq || !p.actions.has(line.food.id)) continue;
            batch.push(toDbRecord(line.food, line.hash, null));
            if (batch.length >= batchSize) await flush();
          }
          await flush();
        }
        log(`applied ${p.input.dataset}: ${p.report.insertedNew} new, ${p.report.updated} updated`);
      }
      for (const [reason, ids] of hides) {
        FoodHiddenReason.parse(reason);
        for (let i = 0; i < ids.length; i += batchSize) {
          await beforeBatch();
          const chunk = ids.slice(i, i + batchSize);
          await inTransaction(async () => {
            await db.query(HIDE_SQL, [chunk, reason, runId]);
          });
          await afterBatch();
        }
      }

      // ---- finalise: each step is idempotent ------------------------------------------------------------------
      await db.query('select food.recompute_canonical($1::integer)', [runId]);
      const canonicalAfter = await canonicalByBarcode(db);
      const perSource = await tierNow();
      for (const [barcode, now2] of canonicalAfter) {
        const was = canonicalBefore.get(barcode);
        const bucket = perSource[now2.source as FoodSource];
        if (!bucket) continue;
        if (!was) bucket.clustersCreated += 1;
        else if (was.id !== now2.id) bucket.clustersChangedCanonical += 1;
      }
      await db.query('vacuum (analyze) food.foods');
      const sizes = await measureSizes(db);
      let status: 'succeeded' | 'failed' = 'succeeded';
      let failureReason: string | undefined;
      if (sizes.actualBytes > config.budget.budgetBytes * (1 + config.budget.failOverFraction)) {
        status = 'failed';
        failureReason = `actual food data size ${sizes.actualBytes} bytes is more than ${config.budget.failOverFraction * 100}% over the ${config.budget.budgetBytes} byte budget`;
      }
      const report = await finish(status, failureReason, sizes, perSource);
      await db.query(
        `update food.import_runs set status = $2::food.run_status, finished_at = now(), report = $3::jsonb
         where id = $1`,
        [runId, status, JSON.stringify(report)],
      );
      log(`run ${runId} ${status}`);
      return report;
    } catch (e) {
      if (!(e instanceof FaultInjectedError)) {
        // Best effort: record the failure; a killed process (or the fault hook) leaves `running` on purpose.
        await db
          .query(
            `update food.import_runs set status = 'failed', finished_at = now() where id = $1`,
            [runId],
          )
          .catch(() => undefined);
      }
      throw e;
    }
  } finally {
    if (lockHeld)
      await db
        .query(`select pg_advisory_unlock(hashtext($1))`, [ADVISORY_LOCK_KEY])
        .catch(() => undefined);
    await db.end().catch(() => undefined);
    if (opts.workDir === undefined) await rm(workDir, { recursive: true, force: true });
  }
}
