import type { Client } from 'pg';
import type { BudgetConfig } from '../schemas/config.js';
import { measureSizes } from '../engine/db.js';
import { checkGolden, loadGoldenList } from './golden.js';
import { GOLDEN_LIST_FILE } from './paths.js';

export interface CheckOutcome {
  ok: boolean;
  lines: string[];
}

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

/** AC 48 / 49: the golden list against whatever is loaded (the fixture, or the full real USDA files). */
export async function goldenCheck(
  db: Client,
  file: string = GOLDEN_LIST_FILE,
): Promise<CheckOutcome> {
  const list = await loadGoldenList(file);
  const results = await checkGolden(db, list);
  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');
  const italian = results.filter((r) => r.entry.group === 'italian');
  const lines = [
    `golden: ${results.length - fails.length - warns.length} of ${results.length} entries pass` +
      ` (${italian.filter((r) => r.status === 'pass').length} of ${italian.length} Italian staples)`,
  ];
  for (const r of fails) {
    lines.push(
      `  FAIL [${r.entry.dataset}:${r.entry.sourceRef}] ${r.entry.referenceName}: ${r.problems.join('; ')}`,
    );
  }
  for (const r of warns) {
    lines.push(
      `  WARN (optional) [${r.entry.dataset}:${r.entry.sourceRef}] ${r.entry.referenceName}: ${r.problems.join('; ')}` +
        ' -> USDA has no usable match; cover it with a barcode in italian-barcodes.json instead',
    );
  }
  return { ok: fails.length === 0, lines };
}

/** AC 6: sizes against the budget (the importer also fails a run more than 10 percent over). */
export async function sizeCheck(db: Client, budget: BudgetConfig): Promise<CheckOutcome> {
  const sizes = await measureSizes(db);
  const tiers = await db.query<{ source: string; dataset: string; tier: string; n: string }>(
    `select source::text, dataset::text, tier::text, count(*)::text as n
     from food.foods where hidden_reason is null group by 1, 2, 3 order by 1, 2, 3`,
  );
  const hidden = await db.query<{ n: string }>(
    `select count(*)::text as n from food.foods where hidden_reason is not null`,
  );
  const limit = budget.budgetBytes * (1 + budget.failOverFraction);
  const lines = [
    `size: food data ${mb(sizes.actualBytes)} of a ${mb(budget.budgetBytes)} budget (failure above ${mb(limit)}); ` +
      `database ${mb(sizes.dbTotalBytes)} of ${mb(budget.hardCeilingBytes)} ceiling`,
    ...tiers.rows.map((r) => `  ${r.source}/${r.dataset} ${r.tier}: ${r.n} visible`),
    `  hidden rows: ${hidden.rows[0]?.n ?? '0'}`,
  ];
  const ok = sizes.actualBytes <= limit && sizes.dbTotalBytes <= budget.hardCeilingBytes;
  if (!ok) lines.push('  FAIL: over the size budget or ceiling. See ADR 0008 for the options.');
  return { ok, lines };
}
