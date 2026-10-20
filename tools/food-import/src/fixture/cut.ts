import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { assertAllowedUrl, downloadFile } from '../download.js';
import type { RulesConfig } from '../schemas/config.js';
import { USDA_NUTRIENTS } from '../usda/nutrients.js';
import { normaliseUsdaGeneric, usdaGenericSourceRef } from '../usda/normalise.js';
import { streamUsdaRecords } from '../usda/reader.js';
import { USDA_TOP_KEY, UsdaGenericFood, type UsdaGenericDataset } from '../usda/schemas.js';
import { sha256File } from '../engine/files.js';
import { GoldenList, sameName, type GoldenEntry } from './golden.js';
import { DEFAULT_DOWNLOAD_DIR, FIXTURE_DIR, FIXTURE_IDS_FILE } from './paths.js';
import { deriveFoundationV2 } from './v2.js';

type Rec = Record<string, unknown>;

export const CUT_DATASETS = ['usda_foundation', 'usda_sr_legacy', 'usda_fndds'] as const;
export type CutDataset = (typeof CUT_DATASETS)[number];

export const FixtureIds = z.strictObject({
  goldenList: z.string(),
  sample: z.strictObject({
    usda_foundation: z.int().nonnegative(),
    usda_sr_legacy: z.int().nonnegative(),
    usda_fndds: z.int().nonnegative(),
  }),
  downloadPage: z.string(),
  fallbackUrls: z.strictObject({
    usda_foundation: z.string(),
    usda_sr_legacy: z.string(),
    usda_fndds: z.string(),
  }),
});
export type FixtureIds = z.infer<typeof FixtureIds>;

/** File-name patterns of the official JSON downloads. Branded and CSV files never match. */
const FILE_PATTERNS: Record<CutDataset, RegExp> = {
  usda_foundation: /foundation/i,
  usda_sr_legacy: /sr[_-]?legacy/i,
  usda_fndds: /survey|fndds/i,
};

/** Links to the three JSON zips on the official download page (pure; the page layout is unverified). */
export function discoverUsdaLinks(html: string, base: string): Partial<Record<CutDataset, string>> {
  const out: Partial<Record<CutDataset, string>> = {};
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+\.zip)["']/gi)].map((m) => m[1] as string);
  for (const ds of CUT_DATASETS) {
    const hits = hrefs
      .filter((h) => FILE_PATTERNS[ds].test(h) && /json/i.test(h) && !/branded|csv/i.test(h))
      .sort()
      .reverse(); // the newest release date sorts last, so reversed first
    const first = hits[0];
    if (first !== undefined) out[ds] = new URL(first, base).toString();
  }
  return out;
}

/** Finds the input file of a dataset in a folder of downloads (newest name wins if several). */
export async function findInputFile(dir: string, ds: CutDataset): Promise<string | null> {
  const names = (await readdir(dir))
    .filter((n) => /\.(zip|json)$/i.test(n) && FILE_PATTERNS[ds].test(n) && !/branded|csv/i.test(n))
    .sort()
    .reverse();
  return names[0] === undefined ? null : path.join(dir, names[0]);
}

// ---- pruning ------------------------------------------------------------------------------------------------------

const KEPT_NUTRIENT_IDS = new Set<number>();
const KEPT_NUTRIENT_NUMBERS = new Set<string>();
for (const spec of Object.values(USDA_NUTRIENTS)) {
  for (const c of spec.candidates) {
    KEPT_NUTRIENT_IDS.add(c.id);
    KEPT_NUTRIENT_NUMBERS.add(c.number);
  }
}

/** Keeps only the fields the importer reads (allowlist), so a few hundred real records stay small. */
export function pruneUsdaRecord(rec: UsdaGenericFood, raw: Rec): Rec {
  const out: Rec = {
    fdcId: rec.fdcId,
    description: rec.description,
    ...(rec.dataType != null ? { dataType: rec.dataType } : {}),
    ...(rec.publicationDate != null ? { publicationDate: rec.publicationDate } : {}),
    ...(raw['ndbNumber'] !== undefined ? { ndbNumber: raw['ndbNumber'] } : {}),
    ...(raw['foodCode'] !== undefined ? { foodCode: raw['foodCode'] } : {}),
  };
  out['foodNutrients'] = rec.foodNutrients
    .filter(
      (n) =>
        KEPT_NUTRIENT_IDS.has(n.nutrient.id) || KEPT_NUTRIENT_NUMBERS.has(n.nutrient.number ?? ''),
    )
    .map((n) => ({
      nutrient: {
        id: n.nutrient.id,
        ...(n.nutrient.number != null ? { number: n.nutrient.number } : {}),
        ...(n.nutrient.name != null ? { name: n.nutrient.name } : {}),
        ...(n.nutrient.unitName != null ? { unitName: n.nutrient.unitName } : {}),
      },
      ...(n.amount != null ? { amount: n.amount } : {}),
    }));
  out['foodPortions'] = rec.foodPortions.map((p) => ({
    ...(p.amount != null ? { amount: p.amount } : {}),
    ...(p.gramWeight != null ? { gramWeight: p.gramWeight } : {}),
    ...(p.modifier != null ? { modifier: p.modifier } : {}),
    ...(p.portionDescription != null ? { portionDescription: p.portionDescription } : {}),
    ...(p.sequenceNumber != null ? { sequenceNumber: p.sequenceNumber } : {}),
    ...(p.measureUnit
      ? {
          measureUnit: {
            ...(p.measureUnit.name != null ? { name: p.measureUnit.name } : {}),
            ...(p.measureUnit.abbreviation != null
              ? { abbreviation: p.measureUnit.abbreviation }
              : {}),
          },
        }
      : {}),
  }));
  return out;
}

// ---- matching -------------------------------------------------------------------------------------------------------

const tokens = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

interface Candidate {
  ref: string;
  description: string;
  score: number;
}

interface Match {
  entry: GoldenEntry;
  tokens: Set<string>;
  exact: { ref: string; rec: Rec; parsed: UsdaGenericFood } | null;
  byName: { ref: string; rec: Rec; parsed: UsdaGenericFood } | null;
  atRef: { description: string } | null;
  fuzzy: Candidate[];
}

const NUTRIENT_NAME_CHECKS: { key: string; ids: number[]; name: RegExp }[] = [
  { key: 'energy (kcal)', ids: [1008], name: /^energy$/i },
  { key: 'energy (kJ)', ids: [1062], name: /^energy$/i },
  { key: 'protein', ids: [1003], name: /^protein$/i },
  { key: 'fat', ids: [1004, 1085], name: /(lipid|fat)/i },
  { key: 'carbohydrate', ids: [1005, 1050], name: /carbohydrate/i },
  { key: 'fibre', ids: [1079, 2033], name: /fiber/i },
  { key: 'sugars', ids: [2000, 1063], name: /sugars/i },
  { key: 'saturated fat', ids: [1258], name: /saturated/i },
  { key: 'sodium', ids: [1093], name: /sodium/i },
  { key: 'alcohol', ids: [1018], name: /alcohol/i },
];

export interface DatasetCutReport {
  dataset: CutDataset;
  file: string;
  releaseLabel: string;
  sha256: string;
  recordsRead: number;
  parseFailures: number;
  firstParseFailure: string | null;
  goldenExact: number;
  goldenRepinned: { entry: GoldenEntry; newRef: string }[];
  goldenUnresolved: { entry: GoldenEntry; atRef: string | null; candidates: Candidate[] }[];
  kcalOutOfRange: { entry: GoldenEntry; ref: string; kcal: number }[];
  servingProblems: { entry: GoldenEntry; ref: string; have: string[] }[];
  sampled: number;
  written: number;
  nutrientNameIssues: string[];
  shapeFacts: string[];
}

export interface CutResult {
  reports: DatasetCutReport[];
  needsAttention: boolean;
  lines: string[];
}

export interface CutOptions {
  from: string | null;
  idsFile?: string;
  fixtureDir?: string;
  downloadDir?: string;
  rules: RulesConfig;
  version: string;
  contact: string | undefined;
  today?: () => string;
  log: (line: string) => void;
  /** Test hook: provides the file of a dataset instead of downloading. */
  fetchDataset?: (ds: CutDataset, ids: FixtureIds) => Promise<string>;
  fetchPage?: (url: string) => Promise<string>;
}

async function defaultFetchPage(url: string, version: string): Promise<string> {
  const u = assertAllowedUrl(url);
  const res = await fetch(u, {
    headers: { 'User-Agent': `TrustTheProcess-food-import/${version}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function acquire(
  ds: CutDataset,
  ids: FixtureIds,
  opts: CutOptions,
  links: Partial<Record<CutDataset, string>>,
): Promise<string> {
  if (opts.fetchDataset) return opts.fetchDataset(ds, ids);
  const dir = opts.downloadDir ?? DEFAULT_DOWNLOAD_DIR;
  if (opts.from === null) {
    const cached = existsSync(dir) ? await findInputFile(dir, ds) : null;
    if (cached) {
      opts.log(`using the file already downloaded: ${path.basename(cached)}`);
      return cached;
    }
    await mkdir(dir, { recursive: true });
    const urls = [links[ds], ids.fallbackUrls[ds]].filter((u): u is string => u !== undefined);
    const tried: string[] = [];
    for (const url of urls) {
      try {
        const out = path.join(dir, path.basename(new URL(url).pathname));
        opts.log(`downloading ${url} (this can take a few minutes) ...`);
        const { bytes } = await downloadFile({
          url,
          dataset: ds,
          outPath: out,
          version: opts.version,
          contact: opts.contact,
        });
        opts.log(`downloaded ${path.basename(out)} (${Math.round(bytes / 1048576)} MB)`);
        return out;
      } catch (e) {
        tried.push(`${url}: ${(e as Error).message}`);
      }
    }
    throw new Error(
      `could not download the ${ds} file.\n${tried.map((t) => `  - ${t}`).join('\n')}\n` +
        `Do it by hand instead: open ${ids.downloadPage} in a browser, download the JSON zip for ${ds}` +
        ` (Foundation Foods, SR Legacy, or FNDDS "Survey"), put the zip(s) in one folder, then run:\n` +
        `  pnpm food:cut-fixture --from <that folder>`,
    );
  }
  const found = await findInputFile(opts.from, ds);
  if (!found) {
    throw new Error(
      `no ${ds} JSON file found in ${opts.from} (looking for a .zip or .json whose name contains ${FILE_PATTERNS[ds].source})`,
    );
  }
  return found;
}

function releaseOf(file: string): string {
  const m = /(\d{4}-\d{2}(?:-\d{2})?)/.exec(path.basename(file));
  return m?.[1] ?? 'unknown-release';
}

const hashKey = (ds: string, ref: string) =>
  createHash('sha256').update(`${ds}:${ref}`).digest('hex');

/** Cuts the fixture from real USDA downloads (operator only). See the printed summary for what to re-pin. */
export async function cutFixture(opts: CutOptions): Promise<CutResult> {
  const idsFile = opts.idsFile ?? FIXTURE_IDS_FILE;
  const fixtureDir = opts.fixtureDir ?? FIXTURE_DIR;
  const today = opts.today ?? (() => new Date().toISOString().slice(0, 10));
  const idsParsed = FixtureIds.safeParse(JSON.parse(await readFile(idsFile, 'utf8')));
  if (!idsParsed.success)
    throw new Error(`invalid ${idsFile}: ${idsParsed.error.issues[0]?.message}`);
  const ids = idsParsed.data;
  const goldenFile = path.resolve(path.dirname(idsFile), ids.goldenList);
  const golden = GoldenList.parse(JSON.parse(await readFile(goldenFile, 'utf8')));

  let links: Partial<Record<CutDataset, string>> = {};
  if (opts.from === null && !opts.fetchDataset) {
    try {
      const html = await (opts.fetchPage ?? ((u) => defaultFetchPage(u, opts.version)))(
        ids.downloadPage,
      );
      links = discoverUsdaLinks(html, ids.downloadPage);
    } catch (e) {
      opts.log(
        `note: could not read ${ids.downloadPage} (${(e as Error).message}); trying the known file names`,
      );
    }
  }

  const reports: DatasetCutReport[] = [];
  const newGolden = golden.map((e) => ({ ...e }));
  const written: Record<string, Rec[]> = {};

  for (const ds of CUT_DATASETS) {
    const file = await acquire(ds, ids, opts, links);
    const sha = await sha256File(file);
    opts.log(`reading ${path.basename(file)} ...`);
    const matches: Match[] = golden
      .filter((e) => e.dataset === ds)
      .map((entry) => ({
        entry,
        tokens: tokens(entry.referenceName),
        exact: null,
        byName: null,
        atRef: null,
        fuzzy: [],
      }));
    const sampleN = ids.sample[ds];
    let sample: { key: string; ref: string; rec: Rec; parsed: UsdaGenericFood }[] = [];
    const report: DatasetCutReport = {
      dataset: ds,
      file: path.basename(file),
      releaseLabel: releaseOf(file),
      sha256: sha,
      recordsRead: 0,
      parseFailures: 0,
      firstParseFailure: null,
      goldenExact: 0,
      goldenRepinned: [],
      goldenUnresolved: [],
      kcalOutOfRange: [],
      servingProblems: [],
      sampled: 0,
      written: 0,
      nutrientNameIssues: [],
      shapeFacts: [],
    };
    const seenNutrients = new Map<number, Set<string>>();
    const facts = {
      idTypes: new Set<string>(),
      dateSamples: new Set<string>(),
      dateNull: 0,
      units: new Set<string>(),
      modifierSamples: new Set<string>(),
      descSamples: new Set<string>(),
      portionsNoWeight: 0,
      portionsTotal: 0,
    };

    for await (const raw of streamUsdaRecords(file, ds)) {
      report.recordsRead += 1;
      const parsed = UsdaGenericFood.safeParse(raw);
      if (!parsed.success) {
        report.parseFailures += 1;
        const issue = parsed.error.issues[0];
        report.firstParseFailure ??= `record ${report.recordsRead - 1}, field "${issue?.path.join('.') ?? ''}": ${issue?.message ?? ''}`;
        continue;
      }
      const rec = parsed.data;
      const rawRec = raw as Rec;
      const ref = usdaGenericSourceRef(ds as UsdaGenericDataset, rec);
      const pruned = pruneUsdaRecord(rec, rawRec);

      // shape facts for the human to compare with src/usda/schemas.ts
      const key = ds === 'usda_fndds' ? 'foodCode' : 'ndbNumber';
      facts.idTypes.add(`${key}:${rawRec[key] === undefined ? 'absent' : typeof rawRec[key]}`);
      if (facts.dateSamples.size < 3 && rec.publicationDate)
        facts.dateSamples.add(rec.publicationDate);
      for (const n of rec.foodNutrients) {
        if (n.nutrient.unitName) facts.units.add(n.nutrient.unitName);
        if (KEPT_NUTRIENT_IDS.has(n.nutrient.id)) {
          const set = seenNutrients.get(n.nutrient.id) ?? new Set<string>();
          set.add(`${n.nutrient.name ?? '?'} [${n.nutrient.unitName ?? '?'}]`);
          seenNutrients.set(n.nutrient.id, set);
        }
      }
      for (const p of rec.foodPortions) {
        facts.portionsTotal += 1;
        if (p.gramWeight == null) facts.portionsNoWeight += 1;
        if (p.modifier != null && facts.modifierSamples.size < 4)
          facts.modifierSamples.add(String(p.modifier));
        if (p.portionDescription != null && facts.descSamples.size < 4)
          facts.descSamples.add(p.portionDescription);
      }

      // golden matching
      const recTokens = tokens(rec.description);
      for (const m of matches) {
        const nameHit = sameName(rec.description, m.entry.referenceName);
        const refHit = ref === m.entry.sourceRef;
        if (refHit && nameHit) m.exact = { ref, rec: pruned, parsed: rec };
        else if (nameHit && (m.byName === null || ref < m.byName.ref))
          m.byName = { ref, rec: pruned, parsed: rec };
        if (refHit && !nameHit) m.atRef = { description: rec.description };
        if (!nameHit) {
          const score = jaccard(recTokens, m.tokens);
          if (score > 0.3) {
            m.fuzzy.push({ ref, description: rec.description, score });
            m.fuzzy.sort((a, b) => b.score - a.score);
            m.fuzzy.length = Math.min(m.fuzzy.length, 3);
          }
        }
      }

      // deterministic sample: the N records with the smallest hash of their id
      if (sampleN > 0) {
        const k = hashKey(ds, ref);
        if (sample.length < sampleN || k < (sample[sample.length - 1] as { key: string }).key) {
          sample.push({ key: k, ref, rec: pruned, parsed: rec });
          sample.sort((a, b) => (a.key < b.key ? -1 : 1));
          if (sample.length > sampleN) sample = sample.slice(0, sampleN);
        }
      }
    }

    // nutrient mapping check: every id we read should carry the expected name
    for (const c of NUTRIENT_NAME_CHECKS) {
      for (const id of c.ids) {
        const names = seenNutrients.get(id);
        if (!names) continue;
        for (const n of names) {
          const nameOnly = n.replace(/ \[.*\]$/, '');
          if (!c.name.test(nameOnly)) {
            report.nutrientNameIssues.push(
              `id ${id} is "${n}" but src/usda/nutrients.ts uses it for ${c.key}`,
            );
          }
        }
      }
    }
    const kcalNames = seenNutrients.get(1008);
    if (kcalNames && ![...kcalNames].some((n) => /\[kcal\]/i.test(n))) {
      report.nutrientNameIssues.push(
        `id 1008 never has unit KCAL (seen: ${[...kcalNames].join('; ')})`,
      );
    }

    const chosen = new Map<string, Rec>();
    for (const m of matches) {
      const hit = m.exact ?? m.byName;
      const gi = newGolden.findIndex((g) => g.dataset === ds && g.sourceRef === m.entry.sourceRef);
      if (!hit) {
        report.goldenUnresolved.push({
          entry: m.entry,
          atRef: m.atRef?.description ?? null,
          candidates: m.fuzzy,
        });
        continue;
      }
      if (m.exact) report.goldenExact += 1;
      else {
        report.goldenRepinned.push({ entry: m.entry, newRef: hit.ref });
        const target = newGolden[gi];
        if (target) target.sourceRef = hit.ref;
      }
      chosen.set(hit.ref, hit.rec);
      // sanity of the real record against the golden expectations
      const outcome = normaliseUsdaGeneric(hit.parsed, ds as UsdaGenericDataset, opts.rules);
      if (outcome.kind === 'candidate') {
        const [lo, hi] = m.entry.kcalRange;
        if (outcome.food.kcal < lo || outcome.food.kcal > hi) {
          report.kcalOutOfRange.push({ entry: m.entry, ref: hit.ref, kcal: outcome.food.kcal });
        }
        if (m.entry.expectedServingLabel) {
          const want = m.entry.expectedServingLabel.toLowerCase();
          if (!outcome.food.servings.some((s) => s.label.toLowerCase().startsWith(want))) {
            report.servingProblems.push({
              entry: m.entry,
              ref: hit.ref,
              have: outcome.food.servings.map((s) => `${s.label} (${s.grams} g)`),
            });
          }
        }
        if (outcome.food.tier !== 'verified') {
          report.kcalOutOfRange.push({ entry: m.entry, ref: hit.ref, kcal: Number.NaN });
        }
      } else {
        report.kcalOutOfRange.push({ entry: m.entry, ref: hit.ref, kcal: Number.NaN });
      }
    }
    for (const s of sample)
      if (!chosen.has(s.ref)) {
        chosen.set(s.ref, s.rec);
        report.sampled += 1;
      }

    // keep what is permanent in the existing file: rule rows, and placeholders for unresolved golden entries
    const target = path.join(fixtureDir, 'usda', `${ds.replace('usda_', '')}.v1.json`);
    let existing: Rec[] = [];
    if (existsSync(target)) {
      const j = JSON.parse(await readFile(target, 'utf8')) as Rec;
      existing = (j[USDA_TOP_KEY[ds]] as Rec[] | undefined) ?? [];
    }
    const unresolvedRefs = new Set(report.goldenUnresolved.map((u) => u.entry.sourceRef));
    const keep = existing.filter((r) => {
      if (r['x_synthetic'] === 'rule-row') return true;
      if (r['x_synthetic'] === 'golden-placeholder') {
        const ref = String(r['ndbNumber'] ?? r['foodCode']);
        return unresolvedRefs.has(ref) && !chosen.has(ref);
      }
      return false; // a previous real cut is replaced
    });
    const real = [...chosen.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, r]) => r);
    const records = [...keep, ...real];
    report.written = real.length;
    written[ds] = records;

    const meta = {
      synthetic: false,
      upstreamRelease: `${report.releaseLabel} (${report.file})`,
      cutDate: today(),
      sha256: sha,
      licence: 'U.S. Government public domain (USDA FoodData Central). See LICENCES.md.',
      note: 'Real records pruned to the fields the importer reads. Rows with x_synthetic are purpose-built test rows.',
    };
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
      target,
      `${JSON.stringify({ [USDA_TOP_KEY[ds]]: records, _fixture: meta }, null, 2)}\n`,
    );
    if (ds === 'usda_foundation') {
      await writeFile(
        path.join(fixtureDir, 'usda', 'foundation.v2.json'),
        `${JSON.stringify({ FoundationFoods: deriveFoundationV2(records), _fixture: { ...meta, note: `${meta.note} Version two.` } }, null, 2)}\n`,
      );
    }

    report.shapeFacts = [
      `${[...facts.idTypes].join(', ')}`,
      `publicationDate examples: ${[...facts.dateSamples].join(' | ') || 'none'} (parseUsdaDate expects M/D/YYYY or ISO)`,
      `unit names seen on kept nutrients: ${[...facts.units].join(', ')}`,
      `portions: ${facts.portionsTotal} total, ${facts.portionsNoWeight} without gramWeight (these are dropped)`,
      `portion modifier examples: ${[...facts.modifierSamples].map((x) => `"${x}"`).join(', ') || 'none'}`,
      `portionDescription examples: ${[...facts.descSamples].map((x) => `"${x}"`).join(', ') || 'none'}`,
    ];
    reports.push(report);
  }

  // manifest labels and provenance, golden re-pins
  for (const version of ['v1', 'v2'] as const) {
    const mf = path.join(fixtureDir, `manifest.${version}.json`);
    const manifest = JSON.parse(await readFile(mf, 'utf8')) as {
      inputs: { dataset: string; releaseLabel: string }[];
      meta: Record<string, string>;
    };
    for (const input of manifest.inputs) {
      const r = reports.find((x) => x.dataset === input.dataset);
      if (r)
        input.releaseLabel = `fixture-${r.releaseLabel}${input.dataset === 'usda_foundation' ? `-${version}` : ''}`;
    }
    manifest.meta = {
      provenance: `real USDA records cut on ${today()} by pnpm food:cut-fixture from ${reports.map((r) => r.file).join(', ')}; rows with x_synthetic are purpose-built test rows (permanent)`,
      licence: 'USDA data: U.S. Government public domain. Synthetic rows: ours. See LICENCES.md',
      ...Object.fromEntries(reports.map((r) => [`sha256:${r.file}`, r.sha256])),
    };
    await writeFile(mf, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  await writeFile(goldenFile, `${JSON.stringify(newGolden, null, 2)}\n`);

  // size
  let bytes = 0;
  for (const f of await readdir(path.join(fixtureDir, 'usda')))
    bytes += (await stat(path.join(fixtureDir, 'usda', f))).size;

  const lines = summarise(reports, bytes);
  const needsAttention = reports.some(
    (r) =>
      r.parseFailures > 0 ||
      r.nutrientNameIssues.length > 0 ||
      r.goldenUnresolved.some((u) => !u.entry.optional) ||
      r.kcalOutOfRange.length > 0 ||
      r.servingProblems.length > 0,
  );
  return { reports, needsAttention, lines };
}

function summarise(reports: DatasetCutReport[], bytes: number): string[] {
  const L: string[] = [];
  L.push('');
  L.push('================ cut-fixture summary ================');
  for (const r of reports) {
    L.push(
      `${r.dataset}: ${r.recordsRead} records read from ${r.file} (release ${r.releaseLabel}, sha256 ${r.sha256.slice(0, 12)}...)`,
    );
    L.push(
      `  wrote ${r.written} real records (${r.goldenExact + r.goldenRepinned.length} golden + ${r.sampled} sampled)`,
    );
  }
  L.push(`fixture size (usda folder): ${(bytes / 1048576).toFixed(2)} MB`);
  L.push('');
  const todo: string[] = [];
  for (const r of reports) {
    if (r.parseFailures > 0) {
      todo.push(
        `[${r.dataset}] ${r.parseFailures} of ${r.recordsRead} real records do not match src/usda/schemas.ts. First: ${r.firstParseFailure}. -> re-pin the schema.`,
      );
    }
    for (const x of r.nutrientNameIssues)
      todo.push(`[${r.dataset}] NUTRIENT MAP: ${x} -> fix src/usda/nutrients.ts.`);
    for (const g of r.goldenRepinned)
      L.push(
        `re-pinned [${r.dataset}] "${g.entry.referenceName}": ref ${g.entry.sourceRef} -> ${g.newRef} (golden-list.json updated)`,
      );
    for (const u of r.goldenUnresolved) {
      const where = u.entry.optional ? 'optional' : 'REQUIRED';
      const cands =
        u.candidates.map((c) => `${c.ref} "${c.description}"`).join('; ') ||
        'no similar description';
      const atRef = u.atRef ? ` (ref ${u.entry.sourceRef} is "${u.atRef}")` : '';
      todo.push(
        `[${r.dataset}] not found (${where}): "${u.entry.referenceName}"${atRef}. Closest: ${cands}. -> edit sourceRef/referenceName in fixtures/golden-list.json, or delete the entry, then re-run. The synthetic placeholder was kept meanwhile.`,
      );
    }
    for (const k of r.kcalOutOfRange) {
      todo.push(
        Number.isNaN(k.kcal)
          ? `[${r.dataset}] "${k.entry.referenceName}" (ref ${k.ref}): the real record is rejected or not "verified" by the rules -> look at it.`
          : `[${r.dataset}] "${k.entry.referenceName}" (ref ${k.ref}): energy ${k.kcal} kcal is outside ${k.entry.kcalRange.join(' to ')} -> widen kcalRange in golden-list.json if the food is right.`,
      );
    }
    for (const s of r.servingProblems) {
      todo.push(
        `[${r.dataset}] "${s.entry.referenceName}": no serving starting with "${s.entry.expectedServingLabel}". Real servings: ${s.have.join('; ') || 'none'} -> set expectedServingLabel (and expectedServingGrams) in golden-list.json.`,
      );
    }
  }
  L.push('Facts about the real files, to compare with src/usda/*.ts (re-pin if anything differs):');
  for (const r of reports) for (const f of r.shapeFacts) L.push(`  [${r.dataset}] ${f}`);
  L.push('');
  if (todo.length === 0) {
    L.push(
      'NOTHING TO RE-PIN. Next: pnpm test && pnpm food:load-fixture && pnpm food:release-check -- --checks golden',
    );
  } else {
    L.push(`NEEDS YOUR ATTENTION (${todo.length}):`);
    for (const t of todo) L.push(`  - ${t}`);
    L.push('');
    L.push(
      'Copy this whole output back into the chat with the engineer. Files were written; synthetic placeholders remain only for entries not found.',
    );
  }
  return L;
}
