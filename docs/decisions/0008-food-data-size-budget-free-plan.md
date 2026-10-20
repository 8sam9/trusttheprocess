# ADR 0008 — Food data must fit a 300 MB budget on the Supabase Free plan, selected by priority and popularity
Status: Accepted (2026-10-20, spec 002 technical plan; pending Gate 3)

## Context
Gate 1 of spec 002 (Q1, CR-2) decided:
- no paid plan before beta;
- Supabase Free has a 500 MB database limit, and **the project turns read-only when it is exceeded** (Supabase
  "database size" docs: data + indexes + materialised views, WAL excluded);
- the budget for food data plus its indexes is ~300 MB;
- USDA generic foods are always kept, Italian products are dropped last, US branded products are dropped first and
  least popular first.

This limit binds every feature that adds bytes per food: search indexes (003), cached live lookups (004) and
embeddings (008).

## Decision
1. **Budget accounting** covers all relations in schema `food`: heap, TOAST and every index, including the search
   indexes 003 adds. The configured budget is 300 MB (`tools/food-import/config/budget.json`). A run fails if the
   measured size exceeds the budget by more than 10 percent (AC 6a).
2. **Hard ceiling.** Before applying, the importer reads `sum(pg_database_size(...))`. It refuses to write if that
   value plus the planned growth would pass **450 MB**. This leaves 50 MB below the read-only trip for dead tuples,
   WAL-unrelated overhead and user writes during the run.
3. **Size model.**
   - `estBytes(row) = base[dataset] + utf8(name) + utf8(brand) + utf8(altNames) + 26 × servings + 1.3 × utf8(name + brand)`.
     The last term is the trigram index share.
   - Base constants were calibrated on a local Postgres with synthetic rows of the planned shape: about 450 bytes
     per row average, of which about 130 bytes is index.
   - Every real run reports `actual / estimated`, and the constants are recalibrated after the first full run.
4. **Selection order** when over budget:
   1. USDA Foundation, SR Legacy and FNDDS are never dropped.
   2. Italy-market OFF products are dropped last, least popular first.
   3. US branded products (USDA Branded and US-market OFF) are dropped first, least popular first.

   Rows already stored that fall below the cut are hidden with `over_budget`. They are not deleted, because a hidden
   row may be referenced by a user (AC 33). Pruning unreferenced hidden rows is a later, human-confirmed operation.
5. **Popularity signals.**
   - **OFF:** `unique_scans_n`, the unique scans in the official OFF app over the last full year (computed yearly
     upstream). Ties break on `popularity_key`, then the newest `last_modified_t`, then `code`.
   - **USDA Branded** has no popularity field. Its signal is the OFF `unique_scans_n` of the **same normalised GTIN**,
     read from the OFF input during the same plan phase. It is used only for the selection decision and is **never
     stored** on the USDA row, so removing OFF data leaves USDA rows unchanged. Ties break on `dataSource = GDSN`
     (manufacturer-supplied) before Label Insight, then the newest `modifiedDate`, then the GTIN.
   - Discontinued Branded records (`discontinuedDate` set) are not selected.
6. **Feature budgets.** A feature that adds per-food bytes must state its size impact in its technical plan and fit
   within the 300 MB. Today's estimate leaves no slack inside it, so new bytes come from dropping US branded rows.
   For example, 008 embeddings at 384 dimensions × 4 bytes ≈ 1.5 KB per row would only fit for the generic foods plus
   a small popular subset.
7. **Upgrade trigger.** We move to Pro at public launch (M2, spec Q1), or earlier if the report shows fewer than
   ~250k US branded rows fit and 004's scan-resolve rate is poor.

## Consequences
+ The selection is deterministic and explainable, and the run report shows what was dropped and why.
+ A bad size estimate can't silently push the project into read-only mode.
− US branded coverage is partial on Free (about 300k of about 580k canonical candidates; see spec 002 T2). Live OFF
  lookups (004) cover the long tail.
− Products that are popular in shops but rarely scanned on OFF rank low. That is the price of using an open signal.
− Using OFF scan counts to rank USDA rows needs human sign-off (spec 002 H2).
