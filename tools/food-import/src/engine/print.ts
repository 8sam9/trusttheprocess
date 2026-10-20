import type { RunReport } from '../schemas/report.js';

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

function counts(c: Record<string, number>): string {
  const entries = Object.entries(c).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? '-' : entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

/** Human-readable run report (AC 51). Counts and reason codes only. */
export function formatReport(r: RunReport): string[] {
  const lines: string[] = [];
  lines.push(
    `Run ${r.run.id ?? '(none)'}: ${r.run.status}${r.run.dryRun ? ' (dry run, database not changed)' : ''}, mode ${r.run.mode}, tool ${r.run.toolVersion}`,
  );
  lines.push(
    `  started ${r.run.startedAtUtc}  finished ${r.run.finishedAtUtc}  ${r.run.durationSeconds.toFixed(1)} s`,
  );
  if (r.run.failureReason) lines.push(`  PROBLEM: ${r.run.failureReason}`);
  for (const d of r.inputs) {
    lines.push(
      `${d.source}/${d.dataset}  release ${d.releaseLabel}  sha256 ${d.fileSha256.slice(0, 12)}...`,
    );
    lines.push(
      `  read ${d.read} = new ${d.insertedNew} + updated ${d.updated} + unchanged ${d.unchanged} + rejected ${Object.values(d.rejected).reduce((a, b) => a + b, 0)} + skipped ${Object.values(d.skippedBySelection).reduce((a, b) => a + b, 0)} + parse errors ${d.parseErrors}`,
    );
    lines.push(`  hidden ${d.hidden} (${counts(d.hiddenByReason)})  un-hidden ${d.unhidden}`);
    lines.push(`  flagged: ${counts(d.flagged)}`);
    lines.push(`  rejected: ${counts(d.rejected)}`);
    lines.push(`  skipped by selection: ${counts(d.skippedBySelection)}`);
  }
  for (const [source, s] of Object.entries(r.perSource)) {
    lines.push(
      `${source}: visible by tier ${counts(s.foodsByTier as Record<string, number>)}; clusters created ${s.clustersCreated}, canonical changed ${s.clustersChangedCanonical}`,
    );
  }
  const b = r.budget;
  lines.push(
    `size: food data ${mb(b.actualBytes)} (estimated ${mb(b.estimatedBytes)}${b.actualOverEstimated === null ? '' : `, actual/estimated ${b.actualOverEstimated}`}); budget ${mb(b.budgetBytes)}, target ${mb(b.targetBytes)}; database ${mb(b.dbTotalBytes)}, free for user data ${mb(b.freeForUserDataBytes)}; dead tuples ${b.deadTuples}`,
  );
  lines.push(
    `checks: reconciled ${r.checks.reconciled}; parse error rate ${(r.checks.parseErrorRate * 100).toFixed(2)}%; mass-removal ${counts(Object.fromEntries(Object.entries(r.checks.massRemoval).map(([k, v]) => [k, Number((v * 100).toFixed(1))])))} (% of visible)`,
  );
  return lines;
}
