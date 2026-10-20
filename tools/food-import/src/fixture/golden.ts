import { readFile } from 'node:fs/promises';
import type { Client } from 'pg';
import { z } from 'zod';
import { GOLDEN_LIST_FILE } from './paths.js';

const range = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([a, b]) => a <= b, { message: 'range must be [min, max] with min <= max' });

/** One golden food (spec Q12, AC 48): where to find it, what it is called, and what its numbers should be. */
export const GoldenEntry = z.strictObject({
  dataset: z.enum(['usda_foundation', 'usda_sr_legacy', 'usda_fndds']),
  /** The importer's source_ref: NDB number (Foundation, SR Legacy) or food code (FNDDS). */
  sourceRef: z.string().min(1),
  /** The upstream description, as the importer stores it (compared case-insensitively). */
  referenceName: z.string().min(1),
  /** Plausible energy per 100 g. */
  kcalRange: range,
  /** The named serving the food must have. Matches a stored label that starts with this text. */
  expectedServingLabel: z.string().min(1).optional(),
  expectedServingGrams: range.optional(),
  /** Italian staples that USDA covers as generic foods (Q12). */
  group: z.literal('italian').optional(),
  /** Uncertain USDA match: a miss is reported as a warning (move it to the barcode list), not a failure. */
  optional: z.boolean().optional(),
});
export type GoldenEntry = z.infer<typeof GoldenEntry>;

export const GoldenList = z
  .array(GoldenEntry)
  .min(1)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((e, i) => {
      const key = `${e.dataset}:${e.sourceRef}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: [i], message: `duplicate golden entry ${key}` });
      }
      seen.add(key);
    });
  });
export type GoldenList = z.infer<typeof GoldenList>;

export async function loadGoldenList(file: string = GOLDEN_LIST_FILE): Promise<GoldenList> {
  const parsed = GoldenList.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `invalid golden list ${file}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`,
    );
  }
  return parsed.data;
}

const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
export const sameName = (a: string, b: string): boolean => squash(a) === squash(b);

export interface GoldenResult {
  entry: GoldenEntry;
  status: 'pass' | 'warn' | 'fail';
  problems: string[];
}

interface StoredGolden {
  dataset: string;
  source_ref: string;
  name: string;
  tier: string;
  hidden_reason: string | null;
  kcal: number;
  servings: { label: string; grams: number }[];
}

/** AC 48 / 49: every golden entry exists, is visible and `verified`, has a plausible energy and its serving. */
export async function checkGolden(db: Client, list: GoldenList): Promise<GoldenResult[]> {
  const keys = list.map((e) => `${e.dataset}:${e.sourceRef}`);
  const { rows } = await db.query<StoredGolden>(
    `select dataset::text, source_ref, name, tier::text, hidden_reason::text, kcal, servings
     from food.foods where dataset::text || ':' || source_ref = any($1::text[])`,
    [keys],
  );
  const byKey = new Map(rows.map((r) => [`${r.dataset}:${r.source_ref}`, r]));

  return list.map((entry) => {
    const row = byKey.get(`${entry.dataset}:${entry.sourceRef}`);
    const problems: string[] = [];
    if (!row) {
      problems.push('not found in the database');
    } else {
      if (row.hidden_reason !== null) problems.push(`hidden (${row.hidden_reason})`);
      if (row.tier !== 'verified') problems.push(`tier is ${row.tier}, expected verified`);
      if (!sameName(row.name, entry.referenceName)) {
        problems.push(`name is "${row.name}", expected "${entry.referenceName}"`);
      }
      const [lo, hi] = entry.kcalRange;
      if (row.kcal < lo || row.kcal > hi) {
        problems.push(`energy ${row.kcal} kcal is outside ${lo} to ${hi}`);
      }
      if (entry.expectedServingLabel !== undefined) {
        const want = squash(entry.expectedServingLabel);
        const hit = row.servings.find((s) => squash(s.label).startsWith(want));
        if (!hit) {
          const have = row.servings.map((s) => `"${s.label}"`).join(', ') || 'none';
          problems.push(`no serving starting with "${entry.expectedServingLabel}" (has ${have})`);
        } else if (entry.expectedServingGrams) {
          const [g0, g1] = entry.expectedServingGrams;
          if (hit.grams < g0 || hit.grams > g1) {
            problems.push(`serving "${hit.label}" weighs ${hit.grams} g, expected ${g0} to ${g1}`);
          }
        }
      }
    }
    const status = problems.length === 0 ? 'pass' : entry.optional ? 'warn' : 'fail';
    return { entry, status, problems };
  });
}
