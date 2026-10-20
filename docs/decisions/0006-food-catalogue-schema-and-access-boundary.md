# ADR 0006 — Food catalogue in its own schema, one provenance-tagged table, one read path
Status: Accepted (2026-10-20, spec 002 technical plan; pending Gate 3)

## Context
Spec 002 fills the food catalogue from USDA FoodData Central and Open Food Facts (OFF). Several features read it:
search (003), barcode scan (004), recents and favourites (005), natural-language matching (008) and badges (009).
Constraints that pull in different directions:
- PRODUCT_SPEC §5 says "keep OFF data in a separate table". ARCHITECTURE.md describes one `foods` table with a
  `source` enum. Gate 1 (spec 002, Q5) turned this into a requirement rather than a design: OFF-derived data must be
  identifiable, exportable and removable as a unit (AC 43).
- We run on the Supabase Free plan with a ~300 MB budget for food data (ADR 0008). Every byte per row matters.
- AC 6b: the food data may later move to a second free Supabase project. That only works by configuration if no
  user table has a foreign key into the catalogue and every caller reads through one module.
- Diary entries snapshot nutrients (ARCHITECTURE), so history never depends on the catalogue row.

## Decision
1. **Schema `food`**, not `public`. It holds `food.foods`, `food.releases` and `food.import_runs`. The schema is
   **not** added to the Data API's exposed schemas. Clients read through `public` RPCs (`get_foods`,
   `lookup_barcode`, and 003's search RPC) that are `SECURITY INVOKER` and run under the caller's RLS.
2. **One table `food.foods`** for both upstream sources. Each row records `source`, `dataset`, `source_ref`,
   `release_id` and `last_run_id` (AC 42). OFF data is separable **logically**: the view `food.off_foods` exports
   it, and `food.remove_off_data()` (privileged, never granted to clients or the importer) deletes it and recomputes
   the canonical flags it influenced (AC 43). No column on a USDA row stores a value taken from OFF.
   *Rejected:* list-partitioning by source (`foods_usda`, `foods_off`). It gives physical separation, but a partitioned
   table can't have a cross-partition unique index on the barcode, so it loses the "one canonical row per barcode"
   constraint. If legal review later requires physical separation, converting to partitions is a contained migration
   because nothing has a foreign key into the table (point 4).
3. **Servings are an inline `jsonb` array on the food** (at most 10 items `{label, grams}`), not a `servings` table.
   Servings are never queried on their own, and inline storage measured about 54 bytes per serving against 104 bytes
   for a table row with its primary key. That saves about 18 MB at the beta size, and a food and its servings are
   always written atomically (AC 37).
4. **No foreign keys from user data to the catalogue.** Diary entries, favourites and recents store `food_id` plus
   the snapshot they need. A hidden food still resolves by id (AC 33), and a deleted or moved catalogue never breaks
   user rows.
5. **Deterministic ids**: `id = uuidv5(FOOD_ID_NAMESPACE, dataset || ':' || source_ref)`. Re-runs, interrupted runs
   and local and remote databases all agree on ids, and the golden list can name foods by `(dataset, source_ref)`.
6. **Clusters are implicit**: rows that share a normalised, non-restricted GTIN-14 `barcode` form a cluster. A
   partial unique index allows at most one visible canonical row per barcode. No cluster table.
7. **One read path** (AC 6b):
   - In the app: `apps/mobile/src/lib/foodData.ts` is the only module that may call the food RPCs. It builds its
     client from optional `EXPO_PUBLIC_FOOD_DATA_URL` / `EXPO_PUBLIC_FOOD_DATA_PUBLISHABLE_KEY` and falls back to the
     main Supabase client.
   - In edge functions: `supabase/functions/_shared/foodData.ts`, created when the first function needs food (008).
   - An architecture test fails if any other file names a food RPC or the `food` schema.

## Consequences
+ One query surface for 003/004/008, one set of RLS policies and one place to recompute clusters. Unique and check
  constraints are enforced by the database.
+ Moving the catalogue to a second project, or adding a CDN or cache in front of it, changes one module and some env vars.
+ The REST API can't bulk-page through the catalogue table, because the schema isn't exposed. Reads are bounded by
  the RPCs (for example, at most 200 ids per call).
− PRODUCT_SPEC §5's "separate table" wording is replaced by "separable" (proposed doc fix in spec 002 T10).
− Every new food read needs an RPC or a change to the access module; there is no ad-hoc `.from('foods')`.
− If the catalogue moves to a second project, that project can't verify the main project's user JWTs. The fallback
  then needs its own auth decision (the cost already noted in spec 002 Q1).
− User-owned foods (006) and LLM estimates (`ai`) are not in this table. 006 decides whether they get their own
  RLS-scoped table or join this one with an owner column. The `source` enum here is `usda | off` only.
