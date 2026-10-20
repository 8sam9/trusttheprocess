import type { Client } from 'pg';
import type { NormalisedFood } from '../types.js';

export interface StoredFood {
  hash: string;
  hidden: string | null;
  dataset: string;
}

/** Page size for reading `(id, content_hash, hidden_reason)` back (ADR 0007 / T5.4 step 2). */
export const STATE_PAGE = 50_000;

/** Stored state of every food in the given datasets, read in keyset pages by id. */
export async function readStoredFoods(
  db: Client,
  datasets: readonly string[],
): Promise<Map<string, StoredFood>> {
  const out = new Map<string, StoredFood>();
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { rows } = await db.query<{
      id: string;
      content_hash: string;
      hidden_reason: string | null;
      dataset: string;
    }>(
      `select id, content_hash::text, hidden_reason::text, dataset::text
       from food.foods where dataset::text = any($1::text[]) and id > $2::uuid
       order by id limit $3`,
      [datasets, after, STATE_PAGE],
    );
    for (const r of rows) {
      out.set(r.id, { hash: r.content_hash, hidden: r.hidden_reason, dataset: r.dataset });
    }
    if (rows.length < STATE_PAGE) return out;
    after = rows[rows.length - 1]?.id ?? after;
  }
}

export async function visibleBySource(db: Client): Promise<Record<string, number>> {
  const { rows } = await db.query<{ source: string; n: string }>(
    `select source::text, count(*)::text as n from food.foods where hidden_reason is null group by source`,
  );
  return Object.fromEntries(rows.map((r) => [r.source, Number(r.n)]));
}

export async function foodsByTier(db: Client): Promise<Record<string, Record<string, number>>> {
  const { rows } = await db.query<{ source: string; tier: string; n: string }>(
    `select source::text, tier::text, count(*)::text as n from food.foods where hidden_reason is null
     group by source, tier`,
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.source] ??= {})[r.tier] = Number(r.n);
  return out;
}

/** Canonical member per barcode cluster, for the cluster counters of the report. */
export async function canonicalByBarcode(
  db: Client,
): Promise<Map<string, { id: string; source: string }>> {
  const { rows } = await db.query<{ barcode: string; id: string; source: string }>(
    `select barcode, id, source::text from food.foods
     where is_canonical and hidden_reason is null and barcode is not null and not barcode_restricted`,
  );
  return new Map(rows.map((r) => [r.barcode, { id: r.id, source: r.source }]));
}

export interface SizeInfo {
  actualBytes: number;
  dbTotalBytes: number;
  deadTuples: number;
  datasetsInDb: string[];
}

export async function measureSizes(db: Client): Promise<SizeInfo> {
  const sizes = await db.query<{ food_bytes: string; db_bytes: string }>(
    `select coalesce(sum(pg_total_relation_size(c.oid)), 0)::text as food_bytes,
            pg_database_size(current_database())::text as db_bytes
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'food' and c.relkind in ('r', 'm')`,
  );
  const dead = await db.query<{ n: string }>(
    `select coalesce(sum(n_dead_tup), 0)::text as n from pg_stat_user_tables where schemaname = 'food'`,
  );
  const ds = await db.query<{ dataset: string }>(
    `select distinct dataset::text from food.foods order by 1`,
  );
  return {
    actualBytes: Number(sizes.rows[0]?.food_bytes ?? 0),
    dbTotalBytes: Number(sizes.rows[0]?.db_bytes ?? 0),
    deadTuples: Number(dead.rows[0]?.n ?? 0),
    datasetsInDb: ds.rows.map((r) => r.dataset),
  };
}

/** JSON shape sent to Postgres for one food (snake_case, matching food.foods columns). */
export function toDbRecord(
  food: NormalisedFood,
  contentHash: string,
  hiddenReason: string | null,
): Record<string, unknown> {
  return {
    id: food.id,
    source: food.source,
    dataset: food.dataset,
    tier: food.tier,
    carbs_basis: food.carbsBasis,
    barcode_restricted: food.barcodeRestricted,
    hidden_reason: hiddenReason,
    kcal: food.kcal,
    protein_g: food.proteinG,
    carbs_g: food.carbsG,
    fat_g: food.fatG,
    fibre_g: food.fibreG,
    sugars_g: food.sugarsG,
    satfat_g: food.satfatG,
    sodium_mg: food.sodiumMg,
    popularity: food.popularity,
    content_hash: contentHash,
    upstream_modified_at: food.upstreamModifiedAt,
    source_ref: food.sourceRef,
    upstream_id: food.upstreamId,
    barcode: food.barcode,
    name_lang: food.nameLang,
    markets: food.markets,
    reasons: food.reasons,
    name: food.name,
    brand: food.brand,
    alt_names: food.altNames,
    servings: food.servings,
  };
}

/**
 * Upsert of one batch (T5.4 step 6). Existing rows are rewritten only when the content hash or the hidden reason
 * differs, so unchanged rows keep `updated_at` and `last_run_id` (AC 30). New rows enter with is_canonical = false;
 * `food.recompute_canonical` decides afterwards. A row whose barcode or hidden state changes drops its canonical
 * flag first, so the partial unique index can never see two canonical members of one barcode.
 */
export const UPSERT_SQL = `
insert into food.foods (
  id, source, dataset, tier, carbs_basis, barcode_restricted, release_id, last_run_id, hidden_reason,
  kcal, protein_g, carbs_g, fat_g, fibre_g, sugars_g, satfat_g, sodium_mg, popularity, content_hash,
  upstream_modified_at, source_ref, upstream_id, barcode, name_lang, markets, reasons, name, brand, alt_names, servings)
select r.id, r.source::food.source, r.dataset::food.dataset, r.tier::food.tier, r.carbs_basis::food.carbs_basis,
  r.barcode_restricted, $2::smallint, $3::integer, r.hidden_reason::food.reason_code,
  r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.fibre_g, r.sugars_g, r.satfat_g, r.sodium_mg, r.popularity,
  r.content_hash, r.upstream_modified_at, r.source_ref, r.upstream_id, r.barcode, r.name_lang,
  r.markets::food.market[], r.reasons::food.reason_code[], r.name, r.brand, r.alt_names, r.servings
from jsonb_to_recordset($1::jsonb) as r(
  id uuid, source text, dataset text, tier text, carbs_basis text, barcode_restricted boolean, hidden_reason text,
  kcal real, protein_g real, carbs_g real, fat_g real, fibre_g real, sugars_g real, satfat_g real, sodium_mg real,
  popularity integer, content_hash bigint, upstream_modified_at timestamptz, source_ref text, upstream_id text,
  barcode text, name_lang text, markets text[], reasons text[], name text, brand text, alt_names jsonb,
  servings jsonb)
on conflict (id) do update set
  tier = excluded.tier, carbs_basis = excluded.carbs_basis, barcode_restricted = excluded.barcode_restricted,
  release_id = excluded.release_id, last_run_id = excluded.last_run_id, hidden_reason = excluded.hidden_reason,
  kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
  fibre_g = excluded.fibre_g, sugars_g = excluded.sugars_g, satfat_g = excluded.satfat_g,
  sodium_mg = excluded.sodium_mg, popularity = excluded.popularity, content_hash = excluded.content_hash,
  upstream_modified_at = excluded.upstream_modified_at, upstream_id = excluded.upstream_id,
  barcode = excluded.barcode, name_lang = excluded.name_lang, markets = excluded.markets,
  reasons = excluded.reasons, name = excluded.name, brand = excluded.brand, alt_names = excluded.alt_names,
  servings = excluded.servings,
  is_canonical = case
    when excluded.barcode is distinct from food.foods.barcode
      or excluded.barcode_restricted is distinct from food.foods.barcode_restricted
      or excluded.hidden_reason is not null then false
    else food.foods.is_canonical end,
  updated_at = now()
where food.foods.content_hash is distinct from excluded.content_hash
   or food.foods.hidden_reason is distinct from excluded.hidden_reason`;

/** Hides rows by id with one reason; values are kept (AC 33, 34). Idempotent: rows already so hidden are skipped. */
export const HIDE_SQL = `
update food.foods
set hidden_reason = $2::food.reason_code, is_canonical = false, last_run_id = $3::integer, updated_at = now()
where id = any($1::uuid[]) and hidden_reason is distinct from $2::food.reason_code`;
