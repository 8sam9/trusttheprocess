import { z } from 'zod';
import { FoodDataset, FoodSource, FoodTier } from '@ttp/shared';

/**
 * RunReport (spec T5.6, AC 6, 51, 53). Counts, reason codes, file names, hashes and timings only: no record
 * contents other than `dataset:source_ref` in the example lists, and no user, diary or contributor data.
 */
const Counts = z.record(z.string(), z.int().nonnegative());
const Count = z.int().nonnegative();

export const DatasetReport = z.strictObject({
  source: FoodSource,
  dataset: FoodDataset,
  releaseLabel: z.string(),
  fileSha256: z.string(),
  /** Records read from the file. Reconciles: read = insertedNew + updated + unchanged + rejected + skipped + parseErrors. */
  read: Count,
  insertedNew: Count,
  updated: Count,
  unchanged: Count,
  /** Stored foods hidden by this run (absence in a snapshot, or newly failing a reject rule). */
  hidden: Count,
  hiddenByReason: Counts,
  /** Stored foods made visible again. A subset of `updated`. */
  unhidden: Count,
  flagged: Counts,
  rejected: Counts,
  skippedBySelection: Counts,
  parseErrors: Count,
  /** First 20 `dataset:source_ref` per reason, to find the rows behind a count. */
  examples: z.record(z.string(), z.array(z.string())),
});
export type DatasetReport = z.infer<typeof DatasetReport>;

export const RunReport = z.strictObject({
  run: z.strictObject({
    id: z.int().positive().nullable(),
    mode: z.enum(['full', 'partial']),
    dryRun: z.boolean(),
    startedAtUtc: z.string(),
    finishedAtUtc: z.string(),
    durationSeconds: z.number().nonnegative(),
    toolVersion: z.string(),
    status: z.enum(['dry_run', 'succeeded', 'failed', 'aborted']),
    failureReason: z.string().optional(),
  }),
  inputs: z.array(DatasetReport),
  perSource: z.partialRecord(
    FoodSource,
    z.strictObject({
      foodsByTier: z.partialRecord(FoodTier, Count),
      clustersCreated: Count,
      clustersChangedCanonical: Count,
    }),
  ),
  budget: z.strictObject({
    budgetBytes: Count,
    targetBytes: Count,
    estimatedBytes: Count,
    actualBytes: Count,
    /** actual / estimated; null when the database holds datasets this run did not read (no like-for-like). */
    actualOverEstimated: z.number().nullable(),
    droppedForBudget: z.record(z.string(), z.record(z.string(), Count)),
    dbTotalBytes: Count,
    freeForUserDataBytes: Count,
    deadTuples: Count,
  }),
  checks: z.strictObject({
    reconciled: z.boolean(),
    /** hides / visible foods, per source (AC 36). */
    massRemoval: z.record(z.string(), z.number()),
    parseErrorRate: z.number().min(0),
  }),
});
export type RunReport = z.infer<typeof RunReport>;
