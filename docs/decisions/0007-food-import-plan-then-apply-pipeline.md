# ADR 0007 — Food import is an operator-run, plan-then-apply diff pipeline in TypeScript
Status: Accepted (2026-10-20, spec 002 technical plan; pending Gate 3)

## Context
Spec 002 needs a repeatable importer for multi-GB upstream files (USDA Branded JSON is 3.1 GB unzipped; the OFF dump
is several GB compressed) into a Supabase Free project. Requirements:
- idempotent (AC 30), safe to interrupt (AC 37), dry run (AC 52) and a mass-removal guard that stops **before** any
  write (AC 36);
- a size budget that must be decided across all sources before writing (AC 6a);
- no contributor data stored (AC 41);
- no locking of app reads;
- no privileged credentials in the client (CLAUDE.md).

The Free plan turns read-only when the database passes 500 MB, so we must also avoid churn: rewriting unchanged rows
leaves dead tuples behind.

## Decision
1. **Workspace package `tools/food-import` (`@ttp/food-import`)**: Node 24, TypeScript strict, run with `tsx` (no
   build step), tests with vitest. Same tsconfig flags as `packages/shared`. Client-facing contracts (row shape,
   enums, GTIN normalisation) live in `packages/shared`. Importer-internal schemas (config, manifest, upstream record
   shapes, run report) live in the tool.
2. **Inputs are the JSON/JSONL dumps, not CSV**:
   - USDA FDC JSON zips are read with `yauzl` and streamed with `stream-json` v3 (`pick` + `streamArray`).
   - OFF uses `openfoodfacts-products.jsonl.gz`, read with `node:zlib` + `node:readline`.
   - We don't use the OFF CSV: it exports the aggregated nutrient set, which upstream prefers *prepared* over
     *as sold*, and it includes obsolete products. Both break AC 11.
   - Each OFF record is projected through an explicit allowlist right after `JSON.parse`. Nothing outside the
     allowlist is kept in memory past that line, written to work files or logged.
3. **Two phases per run.**
   - **Plan** (read-only against the DB):
     1. Stream inputs, normalise and apply rules, and write candidate rows to a local gzipped NDJSON work file.
        Keep only a slim in-memory index (id, priority, estimated bytes, content hash).
     2. Read `(id, content_hash, hidden_reason)` for the affected datasets from the DB.
     3. Apply market selection and the size budget.
     4. Compute the diff: insert / update / unchanged / hide / unhide.
     5. Evaluate guards: mass removal, budget, DB hard ceiling.
     6. Produce the full report.

     A dry run stops here.
   - **Apply**: write only the diff, in batches of 1,000 rows. Each batch is its own transaction, using
     `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE content_hash IS DISTINCT FROM excluded.content_hash`. Then the
     finalise steps run, each idempotent: hide absent rows (full snapshots only), recompute canonical flags,
     `VACUUM (ANALYZE) food.foods`, measure sizes, persist the report.
4. **Change detection by content hash** (first 8 bytes of SHA-256 over the canonical JSON of the normalised row).
   Unchanged rows are never written, so their `updated_at` and `last_run_id` don't move (AC 30), and bloat stays
   small.
5. **Interrupted runs converge**: ids are deterministic (ADR 0006), and every phase is recomputed from the DB state.
   Re-running after a kill produces the remaining diff only (AC 37). A session advisory lock prevents two concurrent
   runs. A run row left `running` is marked `aborted` by the next run.
6. **Least-privilege writer role `food_importer`** (NOLOGIN in the migration).
   - Its grants: `SELECT, INSERT, UPDATE` on the `food` tables, `MAINTAIN` on `food.foods` for VACUUM, and RLS
     policies scoped to that role. No `DELETE` anywhere.
   - On a remote project, a human enables login with a password once. The importer reads `FOOD_IMPORT_DATABASE_URL`
     from the environment only.
   - It does **not** use the Supabase service-role key or the PostgREST API.
   - It connects with `pg` through the session pooler (Free plan direct connections are IPv6-only), or directly.
7. **Target safety.**
   - The default target is the local stack (`127.0.0.1:54322`).
   - Writing requires `--apply`; without it every run is a dry run.
   - A non-local host additionally requires `--confirm-remote <project-ref>` matching the URL.
   - Agents never run `--target remote` (CLAUDE.md).
8. **No scheduler** in 002 (spec Q8). A cron or CI job can wrap the same command later.

## Consequences
+ A dry run is a full rehearsal with exact counts. Guards fire before any write. Runs can be resumed and repeated.
+ App reads are never blocked: only row-level locks in short transactions, and no DDL, `TRUNCATE` or `VACUUM FULL`
  in a run.
+ Refreshes only touch rows that changed, which keeps dead tuples (and the Free-plan size) under control.
+ No native dependencies (`better-sqlite3` was considered for the work file and rejected).
− The plan phase needs local disk for the work files (roughly 1 KB per candidate row, gzipped well below that) and
  one full read of each input file. Multi-hour runs are acceptable (spec §6).
− The canonical-flag recompute scans all barcoded rows each run (seconds at ~0.5 M rows).
− The upstream record shapes are pinned by zod schemas. An upstream format change stops the run (AC 38) until the
  schemas are updated. That is by design.
