# Spec 002: Food database import (USDA FoodData Central + Open Food Facts)

Status: **Approved at Gate 1 (2026-10-20) with change requests CR-1 (Italian products in scope) and CR-2 (Free plan, 300 MB budget, US + Italy for beta); all open questions decided below. No user-facing screens (attribution page moved to 011), so the design stage is skipped. Technical plan drafted by the architect (2026-10-20): split into 002a/002b, ADRs 0006 to 0008. Next: backend-engineer (002a).**
Branch: `feat/002-food-db-import`. Roadmap: Milestone 1, item 002. Product spec: F3 (food data), N5 (data-quality layer, data side only); prerequisite for F4 (004), N1 (008) and the badges in 009.
Sections below the Product section (Design, Technical plan, QA report, reviews) are filled in by later stages.

---

# Product

## 1. Problem and target user

Search (003), barcode scan (004), natural-language logging (008) and the data-quality badges (009) all assume there is a trustworthy food database to read from, and today the `foods` table is empty. This feature fills it: an operator-run pipeline turns the official bulk downloads of USDA FoodData Central (public domain) and Open Food Facts (ODbL) into one consistent set of foods, each with nutrients per 100 g in our canonical units, a few named servings, a normalised barcode, a quality tier and a record of where it came from. Because the wedge in PRODUCT_SPEC is "the fastest way to log food, and it's honest", the pipeline is deliberately selective: it rejects rows that cannot be right, flags rows that look doubtful, links duplicates that share a barcode, and never lets bad upstream data overwrite someone's history. The "users" of this feature are mostly downstream. End users never see an import screen; they feel it as search results that contain the foods they eat (003), scans that resolve (004), AI matches that land on a real row (008) and badges that mean something (009). The one person who touches it directly is the **operator** (today, the founder) who runs imports and checks the report. The only user-visible surface in this feature is a small static "Food data sources" page that carries the licence attributions we owe.

Facts this section relies on (checked 2026-10-20 on official pages; anything marked "architect to confirm" is not verified):
- USDA FDC downloads (fdc.nal.usda.gov/download-datasets): Foundation Foods (release 12/2025, CSV about 3.4 MB zipped), SR Legacy (04/2018, final, never updated), Branded (12/2025, CSV about 427 MB zipped and about 2.9 GB unzipped; JSON about 195 MB zipped), FNDDS 2021-2023 (10/2024, updated every two years). Foundation and Branded are released roughly April and October, with occasional extra releases. The FDC FAQ says Branded values are as shown on labels and supplied by food-industry data providers.
- The data.gov catalogue entry for FoodData Central labels it with the US-government public-domain label. PRODUCT_SPEC §5 says CC0; the download page itself states no licence. Architect or legal to confirm the exact wording to cite.
- Open Food Facts (world.openfoodfacts.org/data): food data is available as CSV (about 0.9 GB compressed, about 9 GB uncompressed, tab-separated UTF-8), JSONL, MongoDB dump and Parquet; cosmetics and pet food are separate files. Exports are generated nightly. Daily delta exports cover the previous 14 days, and **delta files cannot show deleted products**: removals are only visible in a full dump. Database licence is ODbL, contents are DbCL, images are CC BY-SA. The page recommends a prominent in-UI credit with links to Open Food Facts and the ODbL, for example "Contains data from Open Food Facts, available under the Open Database License".
- OFF API rules (openfoodfacts.github.io/openfoodfacts-server/api/): send a custom User-Agent of the form `AppName/Version (ContactEmail)`; limits of 15 requests/min for product reads and 10/min for search, per IP (per user when requests come straight from a mobile app); for more than a few hundred products, use the dumps. This matters for 004's live lookups, not for this import, which uses dumps only.
- OFF terms of use (world.openfoodfacts.org/terms-of-use): re-users must credit Open Food Facts, derivative works must carry the same licence conditions, contributions and edit histories are public but contain personal data of contributors, and third-party rights (trademarks, pack design) are not covered by the licence.
- Supabase pricing page: Free plan has a 500 MB database; Pro includes 8 GB of disk, then $0.125 per extra GB. Raw OFF CSV alone is about 9 GB uncompressed, so a full import into Supabase is not viable and selection is required.

## 2. User stories

End users (served through 003, 004, 008, 009):
1. As someone logging breakfast, I want to find "egg", "banana", "oats" and "whole milk" with believable calories so that I can log common foods in seconds without building them myself.
2. As someone scanning a packet, I want the product to be in the app already when it is common in my market so that the scan resolves instantly, with a live lookup (004) only for the long tail.
3. As a user, I want the same product to appear once, not three times with three different calorie values, so that I do not have to guess which one to pick.
4. As a user, I want to see where a food's numbers come from and how much to trust them (Verified, Brand, Community) so that I can decide when to check the pack.
5. As a user whose carbs I compare against the pack in my hand, I want the carbs number to match the label I see in my region so that the app does not look wrong.
6. As a user with months of diary history, I want an upstream correction to a food not to rewrite what I logged last week so that my history stays stable.
7. As a user who saved a food as a favourite, I want it to still work if the source stops listing it so that my recents do not break.
8. As a user, I want the app to credit the open data it uses so that I know where it comes from.

Downstream features and the operator:
9. As the AI matcher (008), I want real foods with clean names, stable ids and a way to find rows added or changed since my last run so that I can match and (if we choose) embed incrementally.
10. As the data-quality layer (009), I want a quality tier and machine-readable reason codes on every row so that I can render badges and a report-a-value flow without re-deriving the rules.
11. As the search feature (003), I want a golden set of common foods that is guaranteed to exist with sane values so that I can build and test ranking against something real.
12. As the operator, I want one repeatable command that imports a downloaded file, a dry-run mode, and a report of rows read, imported, flagged and rejected so that I can trust a run before it touches production.
13. As a developer or agent, I want a small checked-in fixture and a one-line way to load it so that `supabase start`, CI and agents work without downloading gigabytes.
14. As the privacy owner, I want the importer to read only a fixed allowlist of fields so that no OFF contributor names or other personal data ever reach our database.
15. As the licence owner, I want everything derived from Open Food Facts to be identifiable and separable so that we can meet attribution and share-alike obligations (and remove it if we ever had to).

## 3. Acceptance criteria

Numbering is stable; the QA stage maps each to a test. Test layers: **unit** (parsers, normalisers, rules, in `tools/food-import`), **pipeline** (importer end to end against fixtures into a local database), **pgTAP** (database behaviour and RLS), **release check** (run by the operator against the full real files before beta; not in CI). "Core four" means energy (kcal), protein, carbs and fat. "Canonical nutrients" are energy (kcal), protein (g), carbs (g), fat (g), fibre (g), sugars (g), saturated fat (g) and sodium (mg), all per 100 g. "Hidden" means excluded from default search and barcode results but still readable by id. "Tier" means one of `verified`, `brand`, `community`. "Reject" means the row is not stored; "flag" means it is stored with a tier and one or more reason codes. Numeric thresholds below are product defaults that the architect may express as configuration.

### Scope: which data is imported
1. **USDA datasets.** Given fixture files for USDA Foundation Foods, SR Legacy, FNDDS and Branded, when the importer runs, then foods exist with source `usda` from each of the four datasets, and each row records which dataset it came from and the upstream release identifier (see open question 2 for FNDDS).
2. **Branded versions.** Given the Branded fixture contains two records with the same GTIN and different publication dates, when imported, then only the most recent is active and the older one is hidden with reason `superseded`.
3. **OFF selection.** Given an OFF fixture in which one product each lacks a name, lacks a name in any language accepted for the markets it is sold in, is sold only outside the configured markets, lacks a valid barcode, lacks any of the core four, or fails a reject rule, and one product meets every condition, when imported, then only the conforming product is stored and the report counts each skipped product under its own distinct reason.
4. **Markets are configuration.** Given the list of qualifying markets lives in a configuration file in the repo, when it is changed (for example to add or remove a country) and the importer re-runs on the same fixture, then the set of imported OFF products changes accordingly with no code change. Each market lists the name languages it accepts (English for every market; English or Italian for Italy).
4a. **Italy is a launch market.** Given an OFF fixture with an Italy-only product named only in Italian (for example "Passata di pomodoro"), an Italy-only product with both an Italian and an English name, and a product named only in Italian but sold only in the United Kingdom, when imported, then the first is stored with its Italian name and language `it`; the second is stored with its English name as the display name and its Italian name kept as an alternative name; the third is skipped as `no_accepted_name`. Every stored row records the language of its display name.
4b. **Italian real-data check.** Given a checked-in list of about 30 barcodes of everyday Italian supermarket products (pasta, passata, olive oil, mozzarella, yoghurt, biscuits, cured meats, bread, beverages; drafted by the PM and completed by the human from real packs), when the full real OFF dump is imported, then at least 90 percent resolve by barcode to a visible food, and each miss is listed in the run report with its skip reason. (Release check, run before beta.)
5. **Food files only.** Given OFF cosmetics, pet-food or other non-food product files, when the operator points the importer at one, then it refuses to run with a clear message and writes nothing.
6. **Size is measured.** Given a full run, then the run report states the number of foods per source and tier and the size of the food data and its indexes, so the human can check it against the budget in open question 1. (Release check.)
6a. **Size budget is enforced.** Given a size budget in the importer configuration (beta default: 300 MB for food data plus its indexes) and a selection that would exceed it, when a full run is prepared, then rows are dropped in reverse priority order until the estimate fits: USDA generic foods (Foundation, SR Legacy, FNDDS) are never dropped; Italian products are dropped last; US branded products are dropped first, least popular first (popularity signal: architect to confirm). The run report states the budget, the estimated and actual size, and how many rows were dropped for budget per source and market. Given the actual size after the run exceeds the budget by more than 10 percent, the run is reported as failed.
6b. **One way in for food reads.** Given any app or edge-function code that reads foods, servings or clusters, then it goes through a single food-data access module, so the food data can later move to a separate database project by configuration rather than by rewriting callers (fallback in open question 1).

### Normalisation
7. **Canonical nutrients and units.** Given a USDA Foundation fixture record for a known food (whole raw egg), when imported, then each canonical nutrient equals the upstream value for the matching FDC nutrient, in the canonical unit, per 100 g (unit test with expected values written out in the test).
8. **kJ to kcal.** Given an OFF or USDA record with energy only in kJ, when imported, then kcal equals kJ divided by 4.184 (1,000 kJ gives 239.0 kcal, one decimal), and the row carries the reason code `energy_from_kj`. Given both kcal and kJ are present, then kcal is used.
9. **Salt to sodium.** Given an OFF record with salt but no sodium, when imported, then sodium (mg) equals salt (g) divided by 2.5 and multiplied by 1,000 (1.25 g salt gives 500 mg sodium). Given both are present, sodium is used.
10. **Unknown is not zero.** Given an upstream record with no value for fibre, sugars, saturated fat or sodium, when imported, then that nutrient is stored as unknown, not 0; given an upstream value of exactly 0, then 0 is stored.
11. **As sold only.** Given an OFF record that has both "as sold" and "as prepared" values, when imported, then only the "as sold" values are used; a record that has only "as prepared" values is skipped for lacking core nutrients.
12. **Per 100 g basis.** Given a record whose values are expressed per 100 ml, when imported, then they are stored as per 100 g on the assumption 1 ml = 1 g, with the reason code `volume_basis_assumed`.
13. **Carbs basis recorded.** Given any imported row, then it records its carbohydrate basis (`total`, meaning including fibre, `available`, meaning excluding fibre, or `unknown`) according to the rule decided in open question 4, and USDA rows are `total`. The stored carbs value is the value as published by the source (no fibre is added or subtracted on import).
14. **GTIN normalisation.** Given the same product as a 12-digit UPC-A, a 13-digit EAN-13 (leading zero) and a 14-digit GTIN-14 (two leading zeros), when each form is normalised, then all three yield the same barcode key, and a lookup by any of the three finds the same food.
15. **Invalid barcodes.** Given a barcode with a wrong check digit, non-numeric characters or an unsupported length, when imported, then the food is kept (if it passes all other rules) without a barcode and with the reason code `invalid_barcode`; it is not used for linking or scanning.
16. **In-store codes.** Given an EAN-13 in the restricted-circulation ranges (for example prefixes 02, 04, 2x, which stores assign themselves and which are not unique worldwide), when imported, then it is stored but never used to link foods across sources and carries the reason code `restricted_barcode` (architect to confirm the ranges).
17. **Names.** Given upstream names with leading or trailing whitespace, repeated spaces, or ALL CAPS, when imported, then names are trimmed, whitespace-collapsed and ALL CAPS is converted to sentence or title case; the brand is stored separately from the name; names are not otherwise rewritten, translated or shortened. Given an empty name after trimming, the row is rejected.
18. **Servings.** Given a source with portion data (USDA portions or household serving text, OFF serving size), when imported, then every food has the implicit 100 g basis plus zero to ten named servings, each with a plain label in the food's display-name language (English for USDA; for example "1 large", "1 cup, sliced", "1 slice") and a gram weight greater than 0 and at most 5,000 g. A serving whose gram weight cannot be determined from the source is dropped, never guessed. A food with no usable named servings is still imported.

### Quality and sanity rules
19. **Reject rules.** Given records that each break exactly one of the following, when imported, then each is rejected and counted under its own reason code: missing any of the core four (`missing_core`); any negative nutrient (`negative_value`); protein, carbs or fat above 100 g, or the three together above 105 g, per 100 g (`mass_over_100g`); energy above 905 kcal per 100 g (`energy_too_high`); energy deviating from the Atwater estimate by more than 50 percent and more than 100 kcal (`energy_implausible`, see 20); empty name (`no_name`).
20. **Atwater consistency.** The Atwater estimate is 4 x protein + 4 x carbs + 9 x fat (plus 2 x fibre when carbs basis is `available`). Given energy that deviates from it by more than 20 percent and more than 25 kcal but not enough to reject, when imported, then the row is stored with the reason code `energy_atwater_mismatch` and tier `community`. Rows whose source reports alcohol skip this check and are not flagged by it.
21. **Soft flags.** Given a record where sugars exceed total carbs, saturated fat exceeds total fat (each beyond a 0.5 g rounding allowance), or sodium exceeds 40 g per 100 g, or kcal and kJ both present disagree by more than 10 percent, when imported, then the row is stored, tier `community`, with the corresponding reason code (`sugars_over_carbs`, `satfat_over_fat`, `sodium_implausible`, `energy_unit_mismatch`).
22. **Legitimate zeros.** Given a record with all core nutrients equal to 0 (water, black coffee, diet cola), when imported, then it passes and is not flagged.
23. **Tier assignment.** Given the fixtures, then USDA Foundation, SR Legacy and FNDDS rows that pass all rules are `verified`; USDA Branded rows that pass all rules are `brand`; OFF rows that pass all rules are `brand` only if they meet the completeness condition decided in open question 6, otherwise `community`; any soft-flagged row is `community`. Every stored row has exactly one tier and zero or more reason codes.
24. **Rules are testable in isolation.** Given the rule set, then each rule has a unit test with at least one passing and one failing record, and the thresholds in 19 to 21 are read from one configuration so changing them does not require editing the rules.

### Duplicates across sources
25. **Cluster by barcode.** Given a USDA Branded record and an OFF record with the same normalised barcode (in different formats), when imported, then both are stored, linked as one cluster, and exactly one is canonical.
26. **Canonical choice.** Given a cluster, then the canonical member is chosen by: highest tier, then USDA over OFF, then most recently updated upstream, then lowest source reference as a stable tie-break; and re-running the importer on the same input never changes which member is canonical.
27. **Only canonical surfaces.** Given a cluster, then default search and barcode lookup return only the canonical member; non-canonical members remain readable by id.
28. **No name-based merging.** Given two foods with similar names and no shared barcode, then they are never linked by this feature (name-based dedupe and merging UI belong to 009).
29. **Cluster upkeep.** Given a canonical member is hidden by a later run (for example removed upstream), when the run finishes, then the next best visible member becomes canonical, or the cluster has none and nothing surfaces.

### Updates and history safety
30. **Idempotent.** Given the same input file imported twice, then the second run inserts 0 rows, updates 0 rows, hides 0 rows, and the last-modified marker of every food is unchanged.
31. **Update in place.** Given a food whose upstream nutrients changed between fixture v1 and v2, when v2 is imported, then the same food id carries the new values and a later last-modified marker; no second row is created.
32. **History is untouched.** Given a diary entry whose nutrient snapshot was taken from a food before it changed upstream, when the update in 31 is imported, then the diary entry's snapshot is byte-for-byte unchanged (pgTAP).
33. **Removals hide, never delete.** Given a full-dump import in which a previously imported product is absent, then that food is hidden with the reason `removed_upstream`, still exists, and still resolves by id (so a favourite or diary link keeps working); when it appears again in a later run it becomes visible again.
34. **Newly failing rows hide.** Given an upstream change that makes a stored food fail a reject rule, when imported, then it is hidden with the corresponding reason code, not deleted and not left visible.
35. **Partial runs never hide.** Given a delta or partial-file import, then no food is hidden for being absent; absence only counts in a run declared as a full snapshot.
36. **Mass-removal guard.** Given a full-snapshot run that would hide more than 10 percent of the currently visible foods of that source, then the importer stops before writing and reports why; it proceeds only if the operator re-runs with an explicit override flag.
37. **Interrupted runs.** Given a run is killed part-way (simulated by a fault injected after N batches), then no food is left half-written, and re-running to completion yields the same final state as an uninterrupted run.
38. **Bad input.** Given a file with a missing expected column, a wrong delimiter, or an unreadable archive, when the importer starts, then it aborts before any write with a message naming the problem.

### Privacy, access and licences
39. **Clients read, never write.** Given an authenticated client session, when it selects from foods and servings, then it receives rows; when it attempts to insert, update or delete any row with source `usda` or `off`, then the statement is rejected or affects 0 rows. Given an unauthenticated session, then it receives no rows. (pgTAP; RLS test required by CLAUDE.md.)
40. **Importer is the only writer.** Given the importer runs with a privileged credential supplied only through the environment, then no client bundle, app config or committed file contains that credential (existing hard rule; verified by the secrets check in CI).
41. **No contributor data.** Given an OFF fixture containing sentinel contributor values (creator, editors, last editor, checkers, photographers, informers, uploader names, and any user-identifying URLs), when imported, then none of the sentinel strings appear in any stored column of any table, and the importer reads OFF only through an explicit allowlist of fields (a new upstream field is ignored by default).
42. **Provenance on every row.** Given any stored food, then it records its source, the source's own reference (FDC id or OFF code), the dataset or dump it came from and the run that last changed it.
43. **OFF is separable.** Given the full fixture set loaded, then one operation can list, export and remove exactly the OFF-derived data (rows and anything computed from them) without touching USDA or user data, demonstrated by a pgTAP or pipeline test that removes OFF rows in a transaction and checks that USDA rows, diary entries and user foods are unchanged. (This is a requirement on the schema, not a design; see open question 5.)
44. **Attribution page — moved out of 002 (human, 2026-10-20).** The "Food data sources" page in Settings is now backlog item 011, which must ship before the closed beta (see ROADMAP). Until 011 has shipped, no OFF-derived food may be shown to a user; 002 itself shows nothing to users, so this binds 003 and 004.
45. **Clean-room and polite.** Given the importer's network code, then it can only download from the official USDA FDC and Open Food Facts hosts (allowlist, unit tested), reads bulk files rather than calling search or product APIs, and any HTTP request to Open Food Facts sends a User-Agent that names the app, its version and a contact address. No MyFitnessPal or other commercial source is referenced anywhere in the tool or its fixtures (ADR 0002).

### Fixtures, golden list and local development
46. **Checked-in fixture.** Given a fresh clone, then the repository contains a fixture of at most 5 MB in total that includes: all golden-list USDA rows (see 48), a few hundred USDA Branded rows, a few hundred OFF rows, and purpose-built rows (real or clearly synthetic) covering every rule in 8 to 22, one cross-source shared barcode in three formats, an OFF record with sentinel contributor names, and a second version of part of the data for the update and removal tests (30 to 36). Each fixture file states the upstream release it was cut from and its licence.
47. **One-line local load.** Given a developer runs `supabase start`, then one documented command loads the fixture so that foods, servings and clusters exist locally; CI uses the same path and needs no network and no multi-GB download.
48. **Golden list.** Given a checked-in golden list of about 100 common foods (for example whole egg, banana, cooked white rice, chicken breast, whole milk, olive oil, oats, white bread, apple, cheddar, butter, salmon, potato, broccoli, lentils, peanut butter, black coffee), each entry with a reference source id, a plausible energy range per 100 g, and, where a natural portion exists, the expected named serving, when the fixture is imported, then every golden entry exists as a visible `verified` food whose energy falls within its range and which has the expected named serving.
49. **Golden list on the real data.** Given the full real USDA files imported, then every golden entry still passes 48. (Release check, run before beta and after each USDA release.) The golden list is reviewed by the human at Gate 1 or before beta.
50. **Lookups work.** Given the fixture loaded, then looking up a barcode (in any of its three forms) returns the canonical food, and a name query for each golden entry's reference name returns that food among visible results (functional check only; ranking quality and speed are 003's).

### Operator report and ops metrics
51. **Run report.** Given any run, then the importer prints and persists a report with, per source and dataset: rows read, imported new, updated, unchanged, flagged (by reason), rejected (by reason), skipped by selection (by reason), hidden, un-hidden; upstream release or dump identifier; start and end time in UTC; duration. Counts reconcile: rows read equals the sum of all outcomes.
52. **Dry run.** Given the dry-run option, then the full report is produced and the database is not changed (row counts and last-modified markers identical before and after).
53. **Ops data is private.** Given the persisted run reports, then they are not readable by app clients (pgTAP), contain no user data, and no log line contains a diary, profile or user identifier.
54. **Changes are discoverable.** Given a run completes, then rows inserted or changed by it can be selected by run or by last-modified marker, so 008 (and any later embedding job) can process only what changed.

## 4. Out of scope (explicit)

- The "Food data sources" attribution page (moved to 011, before beta; see AC 44).

- Search UI, ranking, synonyms and aliases for everyday words ("chicken breast" versus the USDA name), search speed targets (003). 002 guarantees the rows exist (AC 48) and that the data carries enough to search; the performance target in PRODUCT_SPEC §7 is validated in 003 on the full data.
- Barcode scan UI, the live Open Food Facts lookup for products not imported, and caching of those lookups (004). Products not imported here are expected to be served that way.
- Badge and tier UI, name-based duplicate detection and merging, "report a wrong value", moderation (009). 002 only supplies tier, reason codes and barcode clusters.
- User-created foods, quick add, recents and favourites (005, 006), and the LLM-estimate (`ai`) source.
- Embeddings and vector search for AI matching: not generated here (see open question 9).
- Product images, ingredients lists, allergens, additives, Nutri-Score, NOVA group, eco-score and every other OFF or USDA field outside the canonical nutrients and servings.
- Micronutrients, vitamins, minerals, alcohol as a stored nutrient, caffeine, cholesterol, trans fat.
- Localisation: names are stored as published in English or, for Italy, in Italian; nothing is translated. Italian-language search (for example typing "pane" and finding USDA "bread") and a translated UI belong to 003 and Milestone 3. Markets other than the six English-speaking ones and Italy are not imported.
- Fetching data from any API, scraping, or any source other than the two official bulk datasets. Any commercial or competitor database.
- Scheduling and hosting of recurring imports (an operator-run command is in scope; a cron or CI job is the architect's call, see open question 8).
- Publishing an ODbL-compliant public export of OFF-derived data (AC 43 only requires that it be possible; whether and when to publish is a legal decision, open question 5).
- The Dietary Supplement Label Database and any food data outside the datasets in AC 1 to 3.

## 5. Analytics events

Product analytics: this feature is a back-end pipeline and adds one client event. It carries no user-identifying properties beyond the standard anonymous id and platform that the analytics layer adds, and no free text.

| Event | Properties | Fires when |
|---|---|---|
| `food_data_sources_viewed` | `surface`: `settings` | The "Food data sources" page is opened |

Success measures are not product analytics. They are read from the run report (ops metrics below), plus these checks owned by other specs once they ship: share of searches with zero results and share of scans that resolve from the imported set (003, 004) show whether the selection is right.

**Ops metrics (run report, not product analytics).** Written by the importer to its report and persisted for the operator; contain no user data, no diary data and no contributor data:

| Metric | Dimensions |
|---|---|
| `rows_read`, `rows_imported_new`, `rows_updated`, `rows_unchanged`, `rows_hidden`, `rows_unhidden` | source, dataset |
| `rows_flagged`, `rows_rejected`, `rows_skipped_by_selection` | source, dataset, reason code |
| `foods_by_tier` (visible rows), `clusters_created`, `clusters_changed_canonical` | source |
| `storage_size` (data + indexes) | table group |
| `run_duration_seconds`, `upstream_release_id`, `mode` (`full`, `partial`, `dry_run`), `started_at_utc` | run |

These are not sent to PostHog and not exposed to clients.

## 6. Edge cases

- **Offline:** the importer needs no network when given local files (only an optional download helper does). The app has no offline dependency on this feature beyond data already synced; the "Food data sources" page is static and bundled, so it opens offline. Catalogue freshness for an offline user is whatever was last synced (offline search is 010's concern; flag to the architect that the full foods table is far too large to sync to the device).
- **Empty states:** before the first import, `foods` is empty, and search (003) must show an ordinary empty result rather than an error. In local development the fixture (AC 47) avoids this. A cluster whose members are all hidden shows nothing.
- **Errors:** a failed or interrupted run leaves the database as it was or fully completed in batches (AC 37). A corrupt download is detected before any write (AC 38). A source release that changes its column names stops the run instead of importing blanks. The mass-removal guard stops a truncated dump from hiding a whole source (AC 36).
- **Units:** storage is metric (g, mg, kcal) per 100 g, as in the architecture conventions. Imperial household measures ("1 cup", "1 oz", "1 fl oz") are kept only as labels with a gram weight; conversion for display is the UI's job. Values per 100 ml are treated as per 100 g with a flag (AC 12); this is wrong by a few percent for oils, honey and syrups, and is accepted because the source's own gram weights are used wherever they exist. Serving sizes given only in ml with no gram weight are assumed at 1 g per ml and carry the same flag.
- **Carbs basis:** USDA and US/Canadian labels give total carbohydrate including fibre; EU and UK labels usually give carbohydrate excluding fibre. The same product can be on either basis depending on source. The basis is recorded per row (AC 13) so that net-carbs (F12) and totals can be computed correctly later; the Atwater check adapts to the basis (AC 20). Until open question 4 is answered, a diary that mixes sources can differ by the fibre content.
- **Names and text:** UTF-8 with diacritics and symbols (percent signs, quotes, ampersands) is preserved; names are Unicode-normalised so that "Crème" typed two ways is one string; OFF CSV fields with embedded quotes, tabs or newlines must not shift columns; extremely long names are truncated at a limit the architect sets, with the full original dropped (no raw blobs are kept).
- **Barcodes:** leading zeros must survive (store as text, never as numbers); GTIN-8 (EAN-8) codes are valid and normalise like the others; a product listed under two different codes stays two foods; store-assigned in-store codes are not unique and are never linked across sources (AC 16).
- **Variable weights and multipacks:** per-100 g nutrients are used as published; multipack totals are not split or recomputed.
- **Branded history:** USDA Branded can hold several versions of the same product over time; only the latest is active (AC 2).
- **Zeros versus unknowns:** a legitimate 0 (diet cola) and a missing value (no sugars listed) are different (AC 10, 22). Downstream sums treat unknown as 0 for totals but must not display "0 g" as if known; 003 and 009 decide how to show it.
- **Release timing:** USDA releases on its own schedule and OFF changes daily; the importer is safe to run at any time and in any order (idempotent, AC 30). Timestamps in run reports are UTC. There is no date or timezone logic for users in this feature, so user-local diary dates are unaffected.
- **Upstream edits that look like corrections or vandalism:** OFF is community-edited. A product's calories may change sharply between runs. The reject and flag rules apply on every run (AC 34), and diary history is protected by snapshots (AC 32). Nothing in 002 reviews changes by hand.
- **Very large or slow runs:** the Branded and OFF files do not fit in memory; the importer must stream. A run that takes hours is acceptable for the operator, but it must not lock reads by the app for the duration (architect to confirm).
- **Source disagreement:** when USDA Branded and OFF disagree on the same barcode, we show one canonical row and do not average or mix fields from both.
- **Hidden food still referenced:** a hidden food can still be linked from a diary entry, a favourite or a recent; it opens with its last known values and the UI may mark it as no longer listed (003/005 decide).

## 7. Copy guidelines

The visible copy in this feature is small: the attribution page, the source and tier labels that other specs render, and an "estimated" qualifier. Tone: plain, factual, calm, and never judging foods or people. Words to avoid: bad, good, clean, junk, cheat, "unhealthy", "wrong", "fake", "suspicious", "unreliable". A flagged or Community row is described by where it comes from, not by a verdict on the food or on the contributor.

- **Settings entry:** "Food data sources".
- **Page title:** "Food data sources".
- **Intro (suggested):** "Our food database is built from open data. Here is where it comes from."
- **USDA block (suggested):** "USDA FoodData Central. Nutrition data for common foods and US packaged foods, from the U.S. Department of Agriculture. Public domain." Link: USDA FoodData Central.
- **Open Food Facts block (suggested):** "Contains data from Open Food Facts, available under the Open Database License. Open Food Facts is a free, community-built database of packaged foods." Links: Open Food Facts and the ODbL text. A short sentence stating that product names, brands and logos belong to their owners.
- **Estimates line (suggested):** "Values come from these sources and are estimates. They can differ from the pack in your hand, so check the label if you want to be sure."
- **Foods you create:** "Foods you create yourself are marked as yours." (Pairs with 006/009.)
- **Source and tier labels that 003/009 render (names fixed here, styling theirs):** "Verified" (USDA reference data), "Brand" (from a product label), "Community" (added or edited by people, not yet checked). Short explainers, suggested: "Verified: measured or reviewed reference data." "Brand: taken from the product label." "Community: contributed by people. Check the pack if you want to be sure."
- **Never** state or imply medical accuracy ("exact", "accurate", "guaranteed"); use "estimate". Do not use the OFF or USDA names in a way that suggests they endorse the app.
- **Operator messages** (importer output) are not user copy, but should be explicit and actionable: say which file, which rule, which count, and what to do next.
- All visible copy is final only after the designer and a sensitivity review; legal review of the attribution wording is recommended (this is not legal advice; see open question 5).

## 8. Open questions for the human

Each has a recommended default. If you approve the spec without answers, the defaults stand.

1. **Database size budget and Supabase plan.** **Decided (human, 2026-10-20):** no paid plan before beta. Stay on Supabase Free (500 MB per project) with a budget of about **300 MB for food data plus indexes**, leaving room for user data. The budget is shared between **US foods** (USDA generic foods in full, then US branded products from USDA Branded and Open Food Facts, most popular first) and **Italian foods** (Open Food Facts products sold in Italy). Other markets (UK, Ireland, Canada, Australia, New Zealand) stay in the configuration but switched off until launch. AC 6a enforces the budget. **Fallback if it doesn't fit usefully:** move the food data into a second free Supabase project (the Free plan allows 2 active projects; AC 6b keeps that a configuration change), at the cost of a second backend for the app, separate sign-in handling for food reads, no free slot left for staging, and two projects to keep from pausing after a week of inactivity. **Upgrade to Pro at public launch (M2)**, when the other markets are switched on.
2. **Which USDA datasets?** **Settled by question 1 (human, 2026-10-20):** generic datasets in full; Branded limited to the US share of the size budget, most popular first. **Default:** Foundation, SR Legacy and FNDDS in full (a few thousand rows each, small, and FNDDS adds mixed dishes such as lasagne and fried rice that single-ingredient data lacks), and Branded after the quality rules, keeping the latest version per barcode. FNDDS tier: `verified` (USDA survey values derived from reference data), though its names are survey-style and may need 003 aliases. If Branded alone overflows the budget, trim by an architect-chosen rule, not by dropping a whole dataset.
3. **Which OFF products?** **Decided (human, 2026-10-20): Italian products must be available.** **Default:** food files only; has a name in a language accepted for one of its markets (English everywhere, plus Italian for Italy); has a valid barcode; has all of the core four on an "as sold" basis; passes the reject rules; and is sold in at least one of the United States, United Kingdom, Ireland, Canada, Australia, New Zealand or Italy (configurable list, AC 4, 4a). For beta only the United States and Italy are switched on, within the size budget (question 1, AC 6a). The architect may add a popularity condition (for example scanned at least once on OFF) if the selection is still over budget. Everything else is served by live lookup (004). Rationale: the product is "global, English-first", but nutrient completeness and English names matter more for search than raw count.
4. **What does "carbs" mean in our app?** **Decided (human, 2026-10-20): option (b), as published with the basis recorded per row.** USDA and US labels give total carbs including fibre; EU and UK labels give carbs excluding fibre; the diary totals, the carb target (spec 001 uses 4 kcal per g) and F12 net carbs all depend on one definition. Options: (a) canonical = total carbohydrate including fibre, converting available-basis products by adding fibre where known; (b) canonical = as published, with a recorded basis per row; (c) canonical = available carbs excluding fibre. **Default: (b)**, so the number matches the pack the user is holding in their own market, with the basis recorded (AC 13) so F12 can compute net carbs as `total - fibre` for total-basis rows and treat available-basis rows as already net. For OFF the basis is inferred from the product's markets (US and Canada: total; elsewhere: available; mixed or unknown: `unknown`), a rule the architect confirms. Consequence to accept: daily totals mix both bases and can differ by the day's fibre; a later spec may add a display toggle. Needs your decision before F12, but recording the basis now is cheap and hard to retrofit.
5. **Licence handling for Open Food Facts (needs legal review; this spec is not legal advice).** **Decided (human, 2026-10-20): default accepted; export/share-alike decision after beta with a legal check, before M2 launch.** PRODUCT_SPEC §5 says to keep OFF data in a separate table, but ARCHITECTURE.md describes one `foods` table with a `source` enum. **Requirement for the architect, not a design:** OFF-derived data must be separable (AC 43): identifiable, exportable and removable as a unit, whatever the physical layout. Open points for legal: whether serving OFF data to users in the app makes our food database a derivative under ODbL (share-alike), what attribution wording and placement is required (AC 44 follows OFF's own example), whether we must offer the OFF-derived data for download, and how the DbCL treatment of contents interacts with mixing in USDA data. **Default:** build separability and attribution now, treat publishing an export as a post-beta decision, and do not mix OFF-derived values into other sources' rows (AC 25 to 29 choose one source's row, never blended). Also check OFF's note that trademarks and pack designs are third-party rights.
6. **Tier for Open Food Facts rows.** **Decided (human, 2026-10-20): default accepted.** OFF is crowd-sourced, so labelling all of it "Brand" overstates it, and labelling all of it "Community" underrates label-derived data. **Default:** `brand` only if the product carries OFF's own "nutrition facts completed" state (architect to confirm the field) and passes all rules; otherwise `community`. USDA Branded is `brand`. 009 can refine.
7. **Atwater tolerance and reject threshold (AC 19, 20).** **Decided (human, 2026-10-20): default accepted; tune after the first real run.** **Default:** flag above 20 percent and 25 kcal off; reject above 50 percent and 100 kcal. Alcohol-bearing foods skip the check. These are starting values; the run report shows how many rows each catches so you can tune them after the first full run.
8. **Refresh cadence and who runs it.** **Decided (human, 2026-10-20): default accepted.** ARCHITECTURE mentions nightly import jobs. OFF publishes nightly, with 14-day deltas that cannot show removals; USDA releases a few times a year (SR Legacy never). **Default:** operator-run command (no scheduled job in this PR); USDA imported on each release; OFF as a full dump about monthly, since new products can be fetched live by 004 and the beta cohort is small. Deltas are not needed for beta. A scheduled job can be added later without changing the importer.
9. **Embeddings for AI matching (008).** **Decided (human, 2026-10-20): default accepted; any embeddings in 008 must fit the food size budget (question 1).** ADR 0003 says the matcher uses trigram plus embedding search. Generating embeddings for millions of rows is costly. **Default:** 002 does not generate embeddings; it guarantees stable ids and discoverable changed rows (AC 54). 008 decides whether to embed only `verified` rows plus a popular-brand subset, or everything, and owns the cost.
10. **Attribution page in this PR or in 003?** **Decided (human, 2026-10-20): neither — a separate backlog item, 011, shipped before the closed beta. No OFF-derived food is shown to users until it exists. 002 therefore has no user-facing screen.** **Default:** in 002 (AC 44), because licence compliance must precede any OFF row reaching a user and the page is a small static screen. If 003 ships first without it, no OFF-derived food may be shown until it exists.
11. **Doubtful rows: shown or hidden by default?** **Decided (human, 2026-10-20): default accepted.** Flagged rows (AC 20, 21) could be hidden, or shown as Community. **Default:** shown, as `community` with reason codes. A scanned product with an odd value is more useful than none, as long as the badge says to check the pack. Rows that fail reject rules are never stored.
12. **Golden list ownership.** **Decided (human, 2026-10-20): default accepted, plus about 15 Italian staples that USDA covers as generic foods (for example cooked pasta, mozzarella, parmesan, prosciutto, ricotta; architect to confirm which have a USDA match). These complement the Italian barcode list in AC 4b.** **Default:** the PM drafts about 100 foods, the nutritionist-minded human (you) skims the list at Gate 1 for obvious gaps in the foods your beta users eat, and the energy ranges come from the USDA reference values with a tolerance. Everyday-name matching ("chicken breast" to a USDA name) is 003's alias work; 002 only supplies the rows.
13. **Which markets does the beta cohort need?** **Decided (human, 2026-10-20):** Italy is a launch market alongside the six English-speaking ones, and products sold in Italy are accepted with Italian names (AC 4a, 4b). Still open: (a) Italian products add database size, so the architect re-checks the budget in question 1 with Italy included (architect to confirm); (b) Italian packs use the EU basis, so most Italian rows are carbs `available` (question 4); (c) typed search in Italian for generic foods ("pane", "riso") will be weak until 003 adds aliases, while branded Italian products are found by name or barcode. **Default:** accept (a) to (c) for beta; add other countries only on request.
14. **Scope split.** **Decided (human, 2026-10-20): default accepted — architect decides; if split, the AC 6a budget, 4a and 4b go with the OFF half (002b), and AC 44 has moved to 011.** This is large for one PR (schema impact, two importers, rules, clustering, fixtures, golden list, attribution page). **Default:** keep it as one spec, but the architect should say in the technical plan if it needs splitting; the natural cut is 002a (USDA importer, shared normalisation and rules, fixtures, golden list, run report, RLS; AC 1 to 2, 7 to 24, 30 to 42, 46 to 54 for USDA) and 002b (OFF importer, selection, clustering and separability, attribution page; AC 3 to 6, 25 to 29, 43 to 45), with USDA first because it alone makes 003 usable.
15. **Liquids at 1 g per ml (AC 12).** **Decided (human, 2026-10-20): default accepted; densities (e.g. for oils) may come in a later feature.** **Default:** accept the approximation with a flag. Alternative: skip all per-100 ml products until densities are available, which would drop most OFF drinks. I recommend accepting.

---

# Technical plan

Status: **drafted by the architect, 2026-10-20.** ADRs: [0006 food catalogue schema and access boundary](../decisions/0006-food-catalogue-schema-and-access-boundary.md), [0007 plan-then-apply import pipeline](../decisions/0007-food-import-plan-then-apply-pipeline.md), [0008 food data size budget on the Free plan](../decisions/0008-food-data-size-budget-free-plan.md). `docs/ARCHITECTURE.md` (data model, import box) has been updated to match. There is no Design section (no screens; Gate 1).

**How facts were checked.** From this environment, the USDA and OFF download hosts return HTTP 403 through the proxy, so no data file (not even a sample) was downloaded. Facts below come from:
- **USDA:** fdc.nal.usda.gov download page and field-descriptions PDF (via the web fetcher), the data.gov catalogue entry, and the GBFPD one-pager (Aug 2026).
- **OFF:** the OFF server source and API schema docs on GitHub (`openfoodfacts/openfoodfacts-server@main`: `scripts/export_database.pl`, `lib/ProductOpener/{Config_off,Nutrition,Products,ProductSchemaChanges,Food}.pm`, `docs/api/ref/schemas/*.yaml`, `docs/api/ref-barcode-normalization.md`, `taxonomies/states.txt`), plus the OFF /data and /countries pages.
- **GS1:** gs1.org/prefixes.
- **Supabase:** docs on database size and on connecting to Postgres.
- **npm:** registry metadata and the shipped type files for the libraries below.

Anything not verified this way is marked **(unverified)**, and the owning task verifies it against a real file. Sizes in T2 were **measured** on a throwaway local PostgreSQL 16 in /tmp with 220k synthetic rows of the planned shape (no Supabase project was touched).

## T1. Key decisions

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Split? | **Yes: 002a then 002b** (T9). 002a covers the schema, read RPCs, access module, shared rules, the importer engine, USDA generic datasets (Foundation, SR Legacy, FNDDS), golden list and fixtures. 002b covers USDA Branded, OFF (incl. Italy), markets, clustering, the size budget and OFF separability. *Deviation from Q14's natural cut:* Branded moves to 002b, because its popularity signal comes from OFF (T2.4) and it is the only USDA dataset that needs the budget. | 002a alone (~14k verified foods, ~10 MB) unblocks 003 and fits easily. The budget, popularity, clusters and ODbL questions all arrive together in 002b. The 001 retro showed large PRs slow review. |
| 2 | Where foods live | Schema `food` (not exposed to the Data API). One table `food.foods` with provenance on every row. Servings are inline `jsonb`. Clusters are implicit by barcode. No FK from user data. Deterministic uuidv5 ids. | ADR 0006. This satisfies PRODUCT_SPEC §5 "separate" as *separable* (AC 43), keeps one canonical row per barcode enforceable, and saves ~18 MB on servings. |
| 3 | How clients read | Only through `public.get_foods`, `public.lookup_barcode` and `public.search_foods` (SECURITY INVOKER, `authenticated` only), called from **one module**, `apps/mobile/src/lib/foodData.ts` (owner: mobile-engineer). | AC 6b, AC 39. A second free project later is an env change. |
| 4 | Importer | `tools/food-import` (Node 24, TS strict, tsx, vitest). It reads the JSON/JSONL dumps (not CSV), works plan-then-apply, writes only content-hash diffs in 1,000-row transactions, and runs as role `food_importer` from `FOOD_IMPORT_DATABASE_URL` (env only). | ADR 0007. AC 30, 36, 37, 52. No service-role key anywhere. |
| 5 | Budget | 300 MB covering every relation in schema `food`. Selection targets 90 percent of it (10 percent churn reserve). Hard ceiling: 450 MB total database size before any apply. | ADR 0008, AC 6a. The Free plan goes read-only at 500 MB. |
| 6 | Popularity | OFF uses `unique_scans_n` (then `popularity_key`). USDA Branded uses the OFF `unique_scans_n` of the same GTIN, used only for ranking and never stored. | USDA has no popularity field (field-descriptions PDF). ADR 0008. Needs H2. |
| 7 | USDA identity | `source_ref` = stable upstream key: Foundation and SR Legacy use `ndbNumber`, FNDDS uses `foodCode`, Branded uses the normalised GTIN-14 (fallback `fdc:<fdcId>`). The current `fdcId` is kept in `upstream_id`. | The FDC help page says "each time the data in a food record changes, that food item receives a new FDC_ID". Keying on fdcId would create a new row per release and break AC 31 and AC 33 for every user link. Changes AC 2's mechanics (T12.1, H4). |
| 8 | OFF nutrients | Values come from `nutrition.input_sets[]` with `preparation = "as_sold"`, source ≠ `estimate`. The `aggregated_set` and CSV `_100g` columns are never used. | OFF's aggregated set **prefers `prepared` over `as_sold`** (`Nutrition.pm` `%preparation_priority`), and the CSV exports it. Using it would silently break AC 11. |
| 9 | Refresh | Operator-run command. Each run is either a declared full snapshot or partial. No scheduler. | Spec Q8. |

## T2. Size estimate (AC 6, 6a) and how the importer computes it

### T2.1 Measured bytes per row (local PG 16, planned schema, 220k synthetic rows)
- **Heap:** about 321 bytes per row on average. Tuple averages: 382 bytes for generic foods (58-char names, about 3 servings) and about 300 bytes for branded (40-char names, 0.5 to 0.9 servings). This includes line pointers and page overhead.
- **Indexes:** primary key 42 bytes, partial unique barcode index 29 bytes, `last_run_id` 7 bytes, partial trigram GIN on `name || ' ' || brand` 52 bytes for 44-char text. Total is about 130 bytes per row.
- **Totals:** about 450 bytes per row overall; about 455 per branded row, about 535 per generic row.
- **Servings:** inline jsonb about 54 bytes per serving, against 104 bytes as a table row with primary key. This is why ADR 0006 point 3 keeps them inline.
- **003 reserve:** 25 bytes per row is added for the search indexes 003 is expected to add (for example, unaccent/FTS). The measured `simple` FTS GIN was 10 to 16 bytes per row.
- **Constants used by the estimator** (in `config/budget.json`; recalibrated after the first full run from `actual/estimated`):

| Segment | bytes/row used |
|---|---|
| USDA generic (Foundation, SR Legacy, FNDDS) | 650 (longer names, up to 10 portions) |
| US branded (USDA Branded, OFF US) | 480 |
| Italy (OFF IT; 30 percent carry an alt name) | 520 |

### T2.2 Rows and bytes (beta selection: US + Italy)

| Segment | Candidate rows after rules (estimate) | Basis | Bytes |
|---|---|---|---|
| USDA generic: SR Legacy about 7.8k, FNDDS 2021-23 about 5.4k, Foundation about 0.4k | about 14k | well known upstream counts **(unverified)**; all kept | about 9 MB |
| OFF Italy | 150k to 260k (planning value 180k) | 260,733 OFF products tagged Italy (OFF /countries, 2026-10-20); about 70 percent pass name, barcode, as-sold core four and rules **(assumption)** | 78 to 135 MB (planning value 94 MB) |
| US branded canonical candidates | about 580k | USDA Branded about 450k products (GBFPD one-pager) minus discontinued; OFF US 821k tagged, about 55 percent pass; about 60 percent of those share a GTIN with USDA (OFF imported USDA data historically) **(assumption)** | 280 MB if all were kept, so it does not fit |
| Non-surfacing rows (superseded, non-canonical cluster members) | about 270k | the overlap above | dropped first under budget (T12.2) |
| `food.import_runs`, `food.releases` | small | about 50 KB per report | under 1 MB |

**Fit:** 300 MB budget × 0.9 = 270 MB selection target. Generic 9 MB + Italy 94 MB = 103 MB, leaving about **167 MB for US branded, about 350k rows** (about 260k if Italy turns out to be 260k candidates). So **about 60 percent of US branded canonical candidates fit, ordered by popularity**. The rest are served by 004's live lookup.

**Room for user data:** 500 MB − 300 MB food − about 25 MB platform schemas (auth, storage; **unverified**, measured by the report as `pg_database_size − food`) leaves about 175 MB.
- A diary entry with indexes is about 450 bytes. 50 beta users × 15 entries a day ≈ 120 MB a year, so the beta is comfortable.
- The report prints `free_for_user_data`.
- When 004 (lookup cache) or 008 (embeddings) add bytes, they come out of the 300 MB (ADR 0008 point 6).

### T2.3 How AC 6a is computed
1. **Plan phase.** For each candidate:
   - `estBytes = base[segment] + utf8Len(name) + utf8Len(brand) + utf8Len(altNames) + 26 × servings + 1.3 × utf8Len(name + ' ' + brand) − baseNameAllowance[segment]`.
   - `base` and `baseNameAllowance` come from the measurements above. The engineer fits them in B12 so that the fixture's estimate matches its actual size within 5 percent.
2. **Selection.** Candidates are sorted by priority:
   1. generic (never dropped);
   2. Italy canonical, then Italy non-canonical;
   3. US canonical, then US non-canonical, then superseded.

   Within each group the order is popularity desc, then the tie-breaks in ADR 0008. Rows are accumulated until the selection target is reached. Each dropped row counts as `over_budget` per source and market. If it already exists in the DB, it is hidden with `over_budget`.
3. **Before apply:** `ceilingCheck = sum(pg_database_size) + Σ estBytes(new rows) − Σ estBytes(newly hidden or dropped) ≤ 450 MB`, otherwise abort.
4. **After finalise:** the actual size is `Σ pg_total_relation_size(c.oid)` for relations in schema `food` (plus the database total). The run is `failed` if `actual > budget × 1.10`. The report states the budget, the estimate, the actual size, `actual/estimated` and drops per source and market.

### T2.4 Popularity signal
- **OFF:** `unique_scans_n`, the unique-IP scans in the official OFF app over the last full year, computed yearly upstream (`product_misc.yaml`). Ties break on `popularity_key`, then the newest `last_modified_t`, then `code`. `popularity_tags` is not used: the upstream docs warn that one scan can earn "top-90-percent" in thin countries.
- **USDA Branded:** the same OFF `unique_scans_n`, looked up by GTIN-14 from the OFF input in the same run (an in-memory `Map<gtin14, scans>`, about 1M entries, about 60 MB RAM). This only works when Branded and OFF are imported in one run. When Branded runs alone, it uses the previous run's stored OFF `popularity` (by barcode). Ties break on `dataSource = 'GDSN'`, then the newest `modifiedDate`, then the GTIN.

## T3. Schema changes

**002a migration:** `supabase/migrations/20261021090000_food_catalogue.sql`. Additive only; no destructive statements.

```sql
create extension if not exists pg_trgm with schema extensions;
create schema food;
comment on schema food is 'Food catalogue (spec 002, ADR 0006). Not exposed to the Data API; read via public RPCs.';
revoke all on schema food from public, anon, authenticated;
grant usage on schema food to authenticated;            -- needed by SECURITY INVOKER RPCs

create type food.source as enum ('usda', 'off');
create type food.dataset as enum ('usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'usda_branded', 'off');
create type food.tier as enum ('verified', 'brand', 'community');
create type food.carbs_basis as enum ('total', 'available', 'unknown');
create type food.market as enum ('us', 'it', 'gb', 'ie', 'ca', 'au', 'nz');
create type food.reason_code as enum (
  -- soft flags (stored in reasons[])
  'energy_from_kj', 'volume_basis_assumed', 'invalid_barcode', 'restricted_barcode', 'energy_atwater_mismatch',
  'sugars_over_carbs', 'satfat_over_fat', 'sodium_implausible', 'energy_unit_mismatch',
  -- hide reasons (stored in hidden_reason)
  'superseded', 'removed_upstream', 'not_selected', 'over_budget',
  'missing_core', 'negative_value', 'mass_over_100g', 'energy_too_high', 'energy_implausible', 'no_name');
-- Skip-only reasons (no_accepted_name, not_in_market, no_valid_barcode, prepared_only, non_food, discontinued, parse_error)
-- exist only in the importer/report, never in the DB.

create role food_importer nologin;   -- a human enables login on a remote project (H5); never the app

create table food.releases (
  id smallint generated always as identity primary key,
  dataset food.dataset not null,
  label text not null check (char_length(label) between 1 and 64),        -- e.g. '2026-04-30', OFF dump date
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (dataset, label, file_sha256)
);

create type food.run_status as enum ('running', 'succeeded', 'failed', 'aborted');
create table food.import_runs (
  id integer generated always as identity primary key,
  status food.run_status not null default 'running',
  mode text not null check (mode in ('full', 'partial')),   -- dry runs are never persisted (AC 52)
  tool_version text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report jsonb                                              -- RunReport (T5.6); no user, diary or contributor data
);

create table food.foods (
  id uuid primary key,                                      -- uuidv5(FOOD_ID_NAMESPACE, dataset || ':' || source_ref)
  source food.source not null,
  dataset food.dataset not null,
  tier food.tier not null,
  carbs_basis food.carbs_basis not null,
  is_canonical boolean not null default false,
  barcode_restricted boolean not null default false,
  release_id smallint not null references food.releases (id),
  last_run_id integer not null references food.import_runs (id),
  hidden_reason food.reason_code check (hidden_reason is null or hidden_reason in (
    'superseded','removed_upstream','not_selected','over_budget','missing_core','negative_value',
    'mass_over_100g','energy_too_high','energy_implausible','no_name')),
  -- canonical nutrients per 100 g (as published; carbs on carbs_basis). NULL = unknown, 0 = known zero (AC 10).
  kcal real not null check (kcal between 0 and 905),
  protein_g real not null check (protein_g between 0 and 100),
  carbs_g real not null check (carbs_g between 0 and 100),
  fat_g real not null check (fat_g between 0 and 100),
  fibre_g real check (fibre_g between 0 and 100),
  sugars_g real check (sugars_g between 0 and 100),
  satfat_g real check (satfat_g between 0 and 100),
  sodium_mg real check (sodium_mg between 0 and 100000),
  popularity integer check (popularity >= 0),               -- OFF unique_scans_n only; null for USDA
  content_hash bigint not null,                             -- first 8 bytes of sha256(canonical JSON of normalised row)
  upstream_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),            -- the importer sets it explicitly only when it writes a change
  source_ref text not null check (char_length(source_ref) between 1 and 64),
  upstream_id text check (char_length(upstream_id) <= 64),  -- current fdcId (USDA); null for OFF
  barcode text check (barcode ~ '^[0-9]{14}$'),             -- normalised GTIN-14; null if absent or invalid
  name_lang text not null check (name_lang in ('en', 'it')),
  markets food.market[] not null default '{}',
  reasons food.reason_code[] not null default '{}',
  name text not null check (char_length(name) between 1 and 200),
  brand text check (char_length(brand) between 1 and 120),
  alt_names jsonb check (alt_names is null or jsonb_typeof(alt_names) = 'object'),   -- {"it": "..."}
  servings jsonb not null default '[]' check (jsonb_typeof(servings) = 'array' and jsonb_array_length(servings) <= 10)
  -- each item {"label": text 1..80, "grams": number (0, 5000]}; validated by the importer (zod), not by SQL
);
comment on table food.foods is
  'Upstream foods (USDA FDC, Open Food Facts). Written only by tools/food-import as food_importer. No user data. OFF rows: ODbL, see food.off_foods.';

create index foods_last_run_idx on food.foods (last_run_id);                                    -- AC 54
create unique index foods_one_canonical_per_barcode on food.foods (barcode)                       -- AC 25-27
  where is_canonical and hidden_reason is null and barcode is not null and not barcode_restricted;
create index foods_search_trgm_idx on food.foods
  using gin ((name || ' ' || coalesce(brand, '')) extensions.gin_trgm_ops)
  where is_canonical and hidden_reason is null;                                                 -- AC 50; 003 may replace

-- RLS
alter table food.foods enable row level security;
alter table food.releases enable row level security;
alter table food.import_runs enable row level security;
revoke all on all tables in schema food from public, anon, authenticated;
grant select on food.foods to authenticated;                                  -- hidden rows readable by id (AC 27, 33)
create policy "foods: authenticated read" on food.foods for select to authenticated using (true);
-- no insert/update/delete grant or policy for authenticated or anon (AC 39); import_runs/releases: none (AC 53)

grant usage on schema food to food_importer;
grant select, insert, update on food.foods, food.releases, food.import_runs to food_importer;   -- no DELETE
grant maintain on food.foods to food_importer;                                                     -- PG 17: VACUUM/ANALYZE
create policy "foods: importer read"   on food.foods for select to food_importer using (true);
create policy "foods: importer insert" on food.foods for insert to food_importer with check (true);
create policy "foods: importer update" on food.foods for update to food_importer using (true) with check (true);
-- same three policies on food.releases and food.import_runs

-- Canonical recompute (AC 26, 29), run by the importer in one transaction after all batches.
-- Two statements so the non-deferrable partial unique index never sees two canonical rows:
--   1) clear is_canonical where the computed winner differs; 2) set is_canonical for new winners.
-- Winner per barcode among visible, non-restricted rows: order by tier (verified>brand>community),
-- source (usda>off), upstream_modified_at desc nulls last, source_ref asc. Rows without a barcode or with a
-- restricted barcode: canonical = visible. Hidden rows: canonical = false. Changed rows get last_run_id = p_run, updated_at = now().
create function food.recompute_canonical(p_run integer) returns integer
language plpgsql security invoker set search_path = '' as $$ ... $$;
revoke execute on function food.recompute_canonical(integer) from public;
grant execute on function food.recompute_canonical(integer) to food_importer;
```

**Read RPCs (002a, `public`, `SECURITY INVOKER`, `stable`, `set search_path = ''`, execute granted to `authenticated` only and revoked from `public` and `anon`):**
- `public.get_foods(p_ids uuid[]) returns setof <FoodRow columns>`. Raises `too_many_ids` above 200. Returns hidden rows too (AC 27, 33), with `hidden boolean` derived from `hidden_reason`.
- `public.lookup_barcode(p_gtin14 text)` returns 0 or 1 row: the visible canonical row with that barcode (non-restricted). It raises `invalid_input` unless the input matches `^[0-9]{14}$`. The client normalises with `normaliseGtin` from `@ttp/shared`, so GTIN logic exists once, in TS.
- `public.search_foods(p_query text, p_limit int default 20)`, with `p_limit` capped at 50. It returns visible canonical rows where `name || ' ' || brand` matches `ILIKE '%' || q || '%'` or trigram similarity `operator(extensions.%)`, ordered by `extensions.similarity` desc. This is a **functional baseline for AC 50 only**. 003 owns ranking and may replace the body while keeping the signature.

The `FoodRow` columns are: id, source, dataset, source_ref, name, name_lang, alt_names, brand, barcode, kcal, protein_g, carbs_g, fat_g, fibre_g, sugars_g, satfat_g, sodium_mg, carbs_basis, tier, reasons, hidden, is_canonical, servings, updated_at. Internal columns are not returned: content_hash, popularity, release_id, last_run_id, upstream_id, markets, barcode_restricted.

**002b migration:** `supabase/migrations/<timestamp after 002a>_food_off_separability.sql`.
- `create view food.off_foods with (security_invoker = true) as select * from food.foods where source = 'off'` (AC 43 list and export). There is no grant to clients.
- `food.remove_off_data() returns jsonb` (`SECURITY INVOKER`). It deletes `where source = 'off'`, then calls `food.recompute_canonical`, and returns counts.
  - Execute is revoked from `public` and from `food_importer`. It is run only by `postgres` after human confirmation (CLAUDE.md: destructive).
  - OFF-derived values never live on USDA rows (the USDA popularity signal is not stored, ADR 0008), so after removal no OFF-derived byte remains.
- No other schema change is needed for OFF: markets, alt names, popularity and carbs basis are already in 002a's table, so 002b only adds data.

**Logs and export.** No user data is involved:
- account deletion and F15 export are unaffected;
- run reports hold counts, reason codes, file names and hashes, and timings only;
- importer logs never print record contents beyond `dataset:source_ref` (AC 41, 53).

## T4. Contracts in `packages/shared` (C1; both sides depend on these; land first)

| File | Exports |
|---|---|
| `src/foods.ts` (new) | **Enums (zod):** `FoodSource` (`usda`,`off`), `FoodDataset`, `FoodTier`, `CarbsBasis`, `FoodMarket`, `FoodFlagCode` (the 9 soft flags), `FoodHiddenReason` (the 10 hide reasons). **Constants:** `FOOD_TIER_LABEL = { verified: 'Verified', brand: 'Brand', community: 'Community' }` (copy fixed in §7; 009 renders it), `MAX_SERVINGS = 10`, `MAX_SERVING_GRAMS = 5000`, `MAX_FOOD_NAME = 200`, `GET_FOODS_MAX_IDS = 200`, `SEARCH_FOODS_MAX_LIMIT = 50`. **Shapes:** `FoodServing = z.strictObject({ label: z.string().min(1).max(80), grams: z.number().gt(0).max(5000) })`; `FoodRow = z.object({...})` matching the RPC columns (numbers nullable for the four optional nutrients; `updated_at` a plain string as in `db.ts`). **RPC args:** `GetFoodsArgs = z.strictObject({ p_ids: z.array(z.uuid()).min(1).max(200) })`, `LookupBarcodeArgs = z.strictObject({ p_gtin14: z.string().regex(/^\d{14}$/) })`, `SearchFoodsArgs = z.strictObject({ p_query: z.string().trim().min(1).max(100), p_limit: z.int().min(1).max(50).optional() })`. **Errors:** `FoodRpcErrorCode = z.enum(['too_many_ids','invalid_input'])`. |
| `src/gtin.ts` (new) | `normaliseGtin(raw: string): { ok: true; gtin14: string; restricted: boolean; kind: 'gtin8'\|'gtin12'\|'gtin13'\|'gtin14' } \| { ok: false; reason: 'non_numeric'\|'bad_length'\|'bad_check_digit' }` and `isRestrictedGtin14(g: string): boolean`. Rules in T6.1. Used by the importer (AC 14 to 16) and by 004's scanner. It is pure and 100 percent unit-tested. |
| `src/index.ts` | re-export both. |

**Importer-internal schemas (in `tools/food-import/src/schemas/`, not shared):** `MarketsConfig`, `RulesConfig` (every threshold in AC 19 to 21), `BudgetConfig`, `Manifest`, `UsdaFood` (Foundation, SR, Survey and Branded record shapes), `OffProductProjection` (the allowlist, T6.2) and `RunReport`.

## T5. Importer (`tools/food-import`)

### T5.1 Package and libraries (versions from the npm registry, 2026-10-20)
- **Workspace and tooling:**
  - add `'tools/*'` to `pnpm-workspace.yaml`;
  - package `@ttp/food-import` (`"type": "module"`, private);
  - tsconfig like `packages/shared`, but `"module": "NodeNext", "moduleResolution": "NodeNext"` (stream-json 3 is ESM-only and documents node16/nodenext resolution), `types: ["node"]`.
- **Runtime dependencies:** `zod` (workspace version), `pg` 8.23, `yauzl` 3.4 (+ `@types/yauzl`), `stream-json` 3.7 (ships its own types; Node ≥ 22), `uuid` 14 (`v5`).
- **Dev dependencies:** `tsx` 4.23, `vitest` 5, `typescript` ~6.0, `@types/node`, `@types/pg`.
- **No native modules.** Node built-ins cover the rest: `node:zlib` gunzip, `node:readline` for JSONL, `node:crypto` sha256, `node:util` `parseArgs`.
- **APIs checked:**
  - stream-json 3: `import { parser } from 'stream-json'`, `import { pick } from 'stream-json/filters/pick.js'`, `import { streamArray } from 'stream-json/streamers/stream-array.js'`, `import chain from 'stream-chain'`, so the pipeline is `chain([zipEntryStream, parser(), pick({ filter: 'BrandedFoods' }), streamArray()])`. `pick.d.ts` was read from the 3.7.0 tarball; the StreamArray wiki page has the `chain` example.
  - `yauzl.open(path, { lazyEntries: true })` → `openReadStream(entry)`.
  - uuid `v5(name, namespace)` per the README.

  The Pick wiki page could not be fetched (the request timed out), so the engineer confirms the `filter` option against `pick.d.ts` (`FilterBaseOptions`) in B5.
- **Scripts:**
  - `test` (unit; runs in CI `app` job via turbo);
  - `test:pipeline` (needs the local DB; CI `food-import` job);
  - `lint`, `typecheck`.
- **Root scripts:** `food:import` (`pnpm --filter @ttp/food-import exec tsx src/cli.ts import`), `food:load-fixture`, `food:cut-fixture`, `food:release-check`.

### T5.2 CLI and target safety
```
food-import import  --manifest <file.json> [--apply] [--target local|remote] [--confirm-remote <project-ref>]
                    [--allow-mass-removal] [--report-dir tools/food-import/.reports] [--throttle-ms 0]
food-import load-fixture             # = import --manifest fixtures/manifest.v1.json --apply --target local
food-import cut-fixture  --from <dir of real downloads> --ids fixtures/fixture-ids.json   # operator, not CI
food-import release-check --checks golden,italian-barcodes,size --target local|remote     # read-only
food-import download --dataset usda_branded|usda_foundation|...|off --out <dir>           # optional helper
```
- **Dry run by default.** Without `--apply`, nothing is written (AC 52). Dry runs print and save the report file but do not insert a run row.
- **Choosing the database.**
  - `--target local` (default) uses `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. It refuses any non-loopback host.
  - `--target remote` reads `FOOD_IMPORT_DATABASE_URL` (env only, documented in `.env.example` under a "tools/food-import/.env (operator machine only)" heading; `.env` is already gitignored). It requires `--confirm-remote <ref>` equal to the project ref parsed from the URL. It refuses port 6543 (transaction pooler: no session advisory lock), so the operator uses the session pooler (5432) or a direct connection (Free plan direct is IPv6-only, per Supabase docs). It refuses any user other than `food_importer` (direct) or `food_importer.<ref>` (pooler username form).
- Agents and CI only ever use `--target local`.
- **Concurrency:** `pg_try_advisory_lock(hashtext('ttp.food_import'))` is taken at start. If the lock is held, the run exits with a message. Any `running` row older than the lock holder is set to `aborted`.
- **Test hook:** the fault-injection env var `FOOD_IMPORT_FAULT_AFTER_BATCHES=N` is honoured only with `--target local` (AC 37 test).

### T5.3 Manifest (input declaration)
`{ mode: 'full'|'partial', inputs: [{ dataset, path, releaseLabel, snapshot: boolean }] }`
- The file's sha256 is computed and stored in `food.releases`.
- `snapshot: true` (full mode only) enables absence-based hiding for that dataset (AC 33, 35).
- One run may contain several inputs. Budget and USDA popularity need Branded and OFF in the same run (T2.4).
- **Preflight (AC 5, 38), before any DB write:**
  - files exist and archives open;
  - USDA top-level key is one of `FoundationFoods | SRLegacyFoods | SurveyFoods | BrandedFoods` and matches the dataset;
  - for OFF: the file name is not `openbeautyfacts`/`openpetfoodfacts`/`openproductsfacts`, **and** the first 1,000 records all have `product_type` absent or `food` (else `non_food_file`);
  - the first 1,000 records parse against the zod upstream schema (else name the missing field);
  - delimiter and CSV issues cannot arise, because CSV is rejected outright with the message "use the JSON/JSONL dump".

### T5.4 Pipeline (ADR 0007)
1. **Stream and normalise** each input:
   - read with zip/gzip → stream-json or readline;
   - project to the allowlist;
   - check with zod (`safeParse`; failures count as `parse_error`, and the run fails if they exceed 1 percent of records);
   - normalise and apply rules, which gives a candidate, a reject, or a skip.

   Candidates go to `.work/<run>/<dataset>.ndjson.gz`. In memory we keep only `{id, segment, priority, estBytes, hash, barcode}`.
2. **Read DB state** for the datasets in the run: `select id, content_hash, hidden_reason, barcode from food.foods where dataset = any($1)`, in pages of 50k by id.
3. **Select:** apply markets (OFF), latest-per-GTIN (Branded), cross-source canonical *preview* (for budget priority) and the budget (T2.3).
4. **Diff:**
   - `insert` (id not in the DB);
   - `update` (hash differs, or the row was hidden for a reason that no longer applies, i.e. an unhide);
   - `unchanged`;
   - `hide` (in the DB, visible, and now absent in a snapshot, failing a reject rule, not selected, superseded or over budget);
   - `keep-hidden`.

   For AC 34, hidden rows keep their last stored values: a failing update sets only `hidden_reason`, `last_run_id` and `updated_at`.
5. **Guards, before any write:**
   - **Mass removal:** per source, `hides / visible_now > 0.10` stops the run unless `--allow-mass-removal` is passed (AC 36).
   - **Budget ceiling** (T2.3).
   - **Reconciliation:** `read == Σ outcomes` (AC 51).
6. **Apply:**
   - insert the run row (`running`);
   - for each batch of 1,000 rows, run one transaction with `insert into food.foods select * from jsonb_populate_recordset(null::food.foods, $1) on conflict (id) do update set … where food.foods.content_hash is distinct from excluded.content_hash or food.foods.hidden_reason is distinct from excluded.hidden_reason`. New rows enter with `is_canonical = false`;
   - write hides in batches by id;
   - optionally sleep `--throttle-ms` between batches (Free compute is small).
7. **Finalise** (each step idempotent):
   - `select food.recompute_canonical($run)` (one transaction);
   - `vacuum (analyze) food.foods` (plain VACUUM; does not block reads);
   - measure sizes;
   - check the budget (T2.3);
   - write the report into `food.import_runs.report`, set the status and release the lock.

**Why reads are never blocked:** writes take only row locks, in short transactions. There is no DDL, `TRUNCATE`, `LOCK`, `VACUUM FULL` or `REINDEX` in a run. MVCC means readers see either the old row or the new one. Between the batches and the recompute, new rows are not yet canonical, so they don't surface; old canonical rows keep surfacing. After an interruption, re-running finishes the job (AC 37).

### T5.5 Normalisation and rules (pure functions in `src/rules/`, one file per rule, thresholds from `config/rules.json`)
- **Energy:** kcal if present. Otherwise kJ / 4.184, rounded to 1 decimal, with flag `energy_from_kj`. If both are present and differ by more than 10 percent, flag `energy_unit_mismatch`.
  - USDA: nutrient id 1008 (Energy, kcal). Foundation records often carry only 2047 (Atwater General) or 2048 (Atwater Specific), so the fallback order is 1008, then 2048, then 2047, then kJ from 1062 **(nutrient ids unverified; B4/B5 confirm on fixture records)**.
- **Sodium:** sodium if present. Otherwise salt × 400 (salt g / 2.5 × 1000 mg). OFF stores salt and sodium in g; mg and µg inputs are converted.
- **Unknown versus zero:** a missing value stays `null`; an upstream `0` is stored as `0` (AC 10).
- **OFF unit conversion:** only g, mg, µg/mcg, kJ and kcal are accepted for the canonical nutrients. Any other unit (`% DV`, IU…) makes that nutrient unknown, and for the core four the product is skipped as `missing_core`.
- **OFF modifier `<`:** the value is used as published.
- **Basis:**
  - per 100 g is used as is;
  - per 100 ml is stored as per 100 g, flag `volume_basis_assumed`;
  - per serving is converted only with `per_quantity ≥ 5` in g, or in ml with the flag. Otherwise the nutrient is unknown.
- **Carbs basis** (AC 13; T6.4): USDA is always `total`. The stored value is always as published.
- **Names:**
  - NFC, trim and whitespace collapse;
  - ALL CAPS (at least 4 letters and no lower-case letter) becomes sentence case for names and title case for brands;
  - truncate at 200 code points, or 120 for brands;
  - empty after trimming means `no_name`.
- **Rules (AC 19 to 22):**
  - the reject list and soft flags exactly as in the spec;
  - the Atwater estimate adds 2 × fibre only when the basis is `available`;
  - the Atwater check is skipped if alcohol is reported (USDA 1018; OFF `alcohol`);
  - all-zero rows pass.
- **Tier (AC 23):** USDA generic rows are `verified`. USDA Branded rows are `brand`. OFF rows are `brand` iff `states_tags` contains `en:nutrition-facts-completed` and no soft flag applies, else `community`. Any soft-flagged row is `community`.
- **Servings (AC 18):**
  - USDA portions: the label joins `amount`, `measureUnit.name` (omitted when `undetermined`), `modifier` and `portionDescription` as appropriate per dataset. The engineer derives the exact join per dataset from fixture records and pins it with tests. Weight is `gramWeight`.
  - USDA Branded: `householdServingFullText`, falling back to "1 serving", with grams = `servingSize` when the unit is g (or ml with the flag).
  - OFF: label `serving_size` (≤ 80), grams `serving_quantity` when `serving_quantity_unit` is g (ml with the flag).
  - All sources: drop a serving if its weight is ≤ 0 or > 5,000 g; dedupe by label; keep the first 10 by upstream order.
- **Content hash:** sha256 over the canonical JSON of `{all stored upstream-derived columns except ids/run/timestamps}` with sorted keys and fixed number formatting. The first 8 bytes are stored as a signed bigint.

### T5.6 Run report (AC 6, 6a, 51)
`RunReport` (zod) contains:
- **run:** `{ id|null, mode, dryRun, startedAtUtc, finishedAtUtc, durationSeconds, toolVersion, status, failureReason? }`;
- **per input:** `{ dataset, releaseLabel, fileSha256 }`;
- **per source × dataset:** `read, insertedNew, updated, unchanged, hidden, unhidden, flagged{code:n}, rejected{code:n}, skippedBySelection{reason:n}`;
- **per source:** `foodsByTier{tier:n}` (visible), `clustersCreated`, `clustersChangedCanonical`;
- **budget:** `{ budgetBytes, targetBytes, estimatedBytes, actualBytes, actualOverEstimated, droppedForBudget{source:{market:n}}, dbTotalBytes, freeForUserDataBytes, deadTuples }`;
- **checks:** `{ reconciled: boolean, massRemoval: {source: ratio}, parseErrorRate }`.

The report is printed as a table and also written as JSON to `--report-dir` (gitignored). For applied runs it is stored in `food.import_runs.report`. It contains no record contents other than `dataset:source_ref` in the "first 20 examples per reason" lists.

## T6. Items flagged "architect to confirm"

### T6.1 GTIN normalisation and restricted ranges (AC 14 to 16)
- **Normalisation:**
  - strip whitespace;
  - digits only (else `non_numeric`);
  - lengths 8, 12, 13 and 14 are accepted, and 9 to 11 are left-padded to 13 as OFF does (others give `bad_length`);
  - left-pad to 14;
  - GS1 mod-10 check digit (else `bad_check_digit`).

  GTIN-8 can't collide with a padded GTIN-13, because GS1 leaves `0000001-0000099` unused "to avoid collision with GTIN-8". An 8-digit code is treated as EAN-8. UPC-E (zero-suppressed) expansion is not done; OFF stores UPC-E as found **(risk R6)**.
- **Restricted (gs1.org/prefixes), on the GTIN-14 key `0` + GTIN-13** (a 12-digit UPC has an implied leading zero, so UPC prefix 2 and 4 are covered by GTIN-13 02x and 04x):
  - GTIN-13 prefix `020-029` (geographic RCN, often variable-weight);
  - GTIN-13 prefix `040-049` (company RCN);
  - GTIN-13 prefix `200-299` (geographic RCN). This also covers OFF's own codes for products without a barcode, which "start with the 200 reserved prefix" (`product_base.yaml`);
  - GTIN-8 starting `0` or `2` (company RCN-8);
  - `980` (refund receipts), `981-984` and `99` (coupons).

  Restricted codes are stored, flagged `restricted_barcode`, never clustered and never returned by `lookup_barcode`.
- `977-979` (ISSN/ISBN) are valid and not restricted. GTIN-14 indicator digits 1 to 9 (case level) are valid and kept as they are.

### T6.2 OFF fields
- **Input:** `openfoodfacts-products.jsonl.gz`, the MongoDB `products` collection export (`scripts/mongodb_dump.sh`). `products_obsolete` is a separate file and is never read; any record with `obsolete` true is skipped as well.
- **Allowlist (the projection; everything else is dropped right after `JSON.parse`):** `code`, `product_type`, `schema_version`, `lang`, `lc`, `product_name`, `product_name_en`, `product_name_it` (plus `product_name_<l>` for the accepted languages of enabled markets), `brands`, `countries_tags`, `states_tags`, `obsolete`, `last_modified_t`, `unique_scans_n`, `popularity_key`, `serving_size`, `serving_quantity`, `serving_quantity_unit`, `nutrition.input_sets[].{preparation, per, per_quantity, per_unit, source, nutrients.{energy-kcal, energy-kj, energy, proteins, carbohydrates, carbohydrates-total, fat, saturated-fat, fiber, sugars, salt, sodium, alcohol}.{value, unit, modifier}}`, `nutrition.no_nutrition_data_on_packaging`. For records with `schema_version < 1003`, the legacy fields are read instead: `nutriments.<n>_100g` / `<n>_unit` and `<n>_prepared_100g` (prepared, so ignored), `nutrition_data_per`, `nutrition_data_prepared`, `no_nutrition_data`. The export script notes that products are dumped without schema upgrades, so both shapes occur.
- **Never read** (contributor and personal data, AC 41): `creator`, `editors_tags`, `informers_tags`, `photographers_tags`, `checkers_tags`, `correctors_tags`, `last_editor`, `last_modified_by`, `last_checker`, `owner`, `owners_tags`, `teams`, `teams_tags`, `sources`, `sources_fields`, `images` (uploader ids), `entry_dates_tags`, `last_edit_dates_tags`, `rev`, `update_key`, `input_sets[].source_description`, `ingredients*`, all `*_url`. These are listed only for the sentinel fixture; the allowlist is what protects us.
- **Nutrition-facts completed:** `states_tags` contains `en:nutrition-facts-completed` (`taxonomies/states.txt`). Finding: upstream sets it when the product has **any non-estimated nutrition input set**, or "no nutrition data on packaging" (`Products.pm`). Almost every product passing our core-four filter therefore qualifies, so OFF rows will be mostly `brand`. Implemented as decided; see H3.
- **Markets:** `countries_tags` values `en:united-states`, `en:italy`, `en:united-kingdom`, `en:ireland`, `en:canada`, `en:australia`, `en:new-zealand`, mapped in `config/markets.json`. Tags survive the 2026-05 tags refactor (schema 1004 removed `*_hierarchy`/`*_lc`, not `*_tags`).
- **Names per language:** `product_name_<lc>`, and `product_name` is the name in `lang`. Rule:
  - the accepted languages are the union over the product's enabled markets;
  - the display name is English if available, otherwise Italian if accepted (`name_lang`);
  - other accepted-language names go to `alt_names`;
  - with no accepted name, the product is skipped as `no_accepted_name` (AC 4a).
- **Brand:** the first comma-separated entry of `brands`. If `brands` turns out to be absent after schema 1004 **(unverified)**, B10 falls back to the last segment of the first `brands_tags` entry, de-slugged.
- **As sold versus prepared (AC 11):** choose the input set with `preparation = as_sold` and `source` in `manufacturer > packaging > usda` (never `estimate`), and `per` in `100g > 100ml > serving`. A product with only `prepared` sets is skipped as `prepared_only` (reported as `missing_core`, per AC 11's wording).

### T6.3 USDA fields **(record shapes unverified here; B5/B9 pin them with zod against fixture records)**
`fdcId`, `description`, `publicationDate`, `ndbNumber` (Foundation/SR), `foodCode` (Survey), `foodNutrients[].{nutrient.{id,number,unitName}, amount}`, `foodPortions[].{gramWeight, amount, modifier, portionDescription, measureUnit.{name,abbreviation}, sequenceNumber}`. Branded additionally has `gtinUpc`, `brandOwner`, `brandName`, `dataSource`, `modifiedDate`, `availableDate`, `discontinuedDate`, `marketCountry`, `servingSize`, `servingSizeUnit`, `householdServingFullText`. These match the field-descriptions PDF (CSV names in snake_case).

**Branded rules:**
- `marketCountry` must map to an enabled market (only "United States" for beta);
- `discontinuedDate` set means skipped as `discontinued`;
- per GTIN the latest `publicationDate` wins (then `modifiedDate`, then the highest fdcId), and the others count as `superseded`.

**Formats:** FNDDS is read from the JSON zip (64 MB unzipped), not the 1.6 GB CSV.

### T6.4 Carb basis inference for OFF (AC 13)
OFF now has separate nutrients, per `nutrients_v3_base.yaml`: `carbohydrates-total` ("US/Canada definition … includes fiber") and `carbohydrates` ("available … excluding fiber").
1. If the chosen set has `carbohydrates-total`, the basis is `total`.
2. Otherwise, if the set source is `usda`, the basis is `total`.
3. Otherwise, if it has `carbohydrates`: use the product's markets (among *all configured* markets, enabled or not). Only `us`/`ca` gives `total`, because legacy US entries put total carbs in `carbohydrates`. Only other markets gives `available`. Mixed or none gives `unknown`.
4. Neither present: skipped as `missing_core`.

Expect most Italian rows to be `available` (spec Q13b).

### T6.5 Italian staples with a USDA generic match (spec Q12)
This is from the architect's knowledge of SR Legacy and FNDDS descriptions, **unverified against the files**. B7 confirms each against the real files via `cut-fixture` and moves misses to the AC 4b barcode list.
- **Likely in SR Legacy:**
  - pasta: cooked enriched pasta, whole-wheat spaghetti;
  - cheeses: mozzarella (whole milk), parmesan (hard and grated), ricotta (whole milk), provolone;
  - cured meats: Italian pork salami, mortadella;
  - olive oil, canned tomato purée (≈ passata), pesto sauce (ready-to-serve), espresso (brewed);
  - vegetables and pulses: arugula, zucchini, cannellini (canned white beans), chickpeas;
  - plain breadsticks (≈ grissini).
- **Likely in FNDDS:** prosciutto, potato gnocchi, risotto, polenta, cheese pizza, biscotti, focaccia (uncertain).
- **Probably no USDA match** (left to AC 4b barcodes): bresaola, burrata, mascarpone (uncertain), pancetta, taralli, fette biscottate.

### T6.6 Do long imports block app reads?
No, by construction (T5.4): only row locks in short transactions, no DDL and no exclusive locks. The residual effect is **CPU and IO contention** on Free compute during a multi-hour run. Mitigations are `--throttle-ms`, running off-peak, and the signal in R9.

## T7. Fixtures, local load and CI (AC 46 to 47)
- **Layout:** `tools/food-import/fixtures/`.
  - `usda/{foundation,sr_legacy,fndds,branded}.v1.json` and `branded.v2.json`, in the same top-level shape as the real files but plain JSON (diffable). The zip path is tested by zipping a fixture in a temp dir at test time.
  - `off/products.v1.jsonl` and `products.v2.jsonl`, `off/not-food.jsonl` (AC 5).
  - `golden-list.json`: about 100 entries plus about 15 Italian staples (T6.5), each `{ dataset, sourceRef, referenceName, kcalRange: [min,max], expectedServingLabel? }`.
  - `italian-barcodes.json`: about 30 GTINs; the PM drafts and the human completes from real packs (AC 4b).
  - `manifest.v1.json` and `manifest.v2.json`, plus `LICENCES.md`.
- **Content:**
  - real records cut from upstream releases, **pruned** by `cut-fixture` to the allowlisted fields (USDA `foodNutrients` reduced to the ids we read), so a few hundred records stay small;
  - synthetic rule rows (AC 8 to 22), with `source_ref` prefixed `synthetic-`, names starting "Test ", and barcodes under GS1 prefix `050-059` ("GS1 US reserved for future use", valid check digits, never real products);
  - one cross-source GTIN in UPC-A, EAN-13 and GTIN-14 forms;
  - an OFF record carrying sentinel contributor strings in every never-read field (AC 41);
  - v2 files with a changed nutrient, a removed product, a newly failing product and a re-appearing product (AC 30 to 36).
- **Licences:** `LICENCES.md`, plus a `meta` block in each manifest, records for every file the upstream release, the cut date and the licence:
  - USDA: U.S. public domain;
  - OFF: "Contains data from Open Food Facts, available under the Open Database License (ODbL); contents DbCL". The OFF fixture is itself an ODbL extract and stays under ODbL;
  - synthetic rows: our own.
- **Size check:** a unit test asserts the fixtures directory is ≤ 5 MB. The estimate is 2 to 3 MB.
- **One-line local load (AC 47):** after `pnpm db:start` (or `pnpm db:reset`), run `pnpm food:load-fixture`. It needs no network.
  - Rejected alternative: a generated `seed.sql`. It would duplicate the importer output and need a staleness check, and the pipeline tests must exercise the importer anyway.
- **CI impact:**
  - `pnpm-workspace.yaml` gains `tools/*`, so lint, typecheck and unit tests run in the existing `app` job (adds about 20 s);
  - new job `food-import` ("Importer pipeline on fixtures"): checkout, pnpm and node 24, `supabase/setup-cli@v3`, `supabase db start`, `pnpm install --frozen-lockfile`, `pnpm --filter @ttp/food-import test:pipeline` (adds about 2 to 4 min, in parallel with the other jobs);
  - a secrets scan step (gitleaks `dir`, pinned official image) added to `app`, because AC 40 refers to "the secrets check in CI", which does not exist yet;
  - the existing `database` job runs the new pgTAP files automatically.
- **Fixture provenance problem:** the agent environment can't reach the data hosts, so real records can't be cut by an agent (H1).

## T8. Client plan
- **Screens and routes:** none. Attribution is item 011. **Binding note for 003 and 004:** no OFF-derived row may be shown until 011 ships. `foodData.ts` therefore exposes `includeOff` (default `false`) until 011 flips it. The RPCs accept `p_include_off boolean default false` and filter `source <> 'off'` when false. For lookup this is applied before choosing the canonical row, so a USDA member is returned when available.
- **Food read module:** `apps/mobile/src/lib/foodData.ts` (owner: mobile-engineer, task M1).
  - Exports `getFoods(ids)`, `lookupBarcode(raw)` (normalises with `normaliseGtin`; restricted or invalid input returns null without a call), and `searchFoods(query, limit?)`. Each validates its args with the C1 zod schemas and parses results with `FoodRow`.
  - The client is `createClient(EXPO_PUBLIC_FOOD_DATA_URL, EXPO_PUBLIC_FOOD_DATA_PUBLISHABLE_KEY)` when both are set, otherwise the existing `src/lib/supabase.ts` client. Both vars are optional and documented in `.env.example`.
  - A jest architecture test fails if any file in `apps/mobile/src` other than `lib/foodData.ts` contains `get_foods`, `lookup_barcode`, `search_foods` or `schema('food')`.
  - The edge-function twin, `supabase/functions/_shared/foodData.ts`, is created by the first function that needs food (008); the same grep test then covers `supabase/functions`.
- **State:** server only (TanStack Query in 003). Nothing is cached on the device in 002. The full catalogue will never be synced to SQLite (about 270 MB). 010 decides what to cache offline (recents and favourites snapshots).
- **Offline behaviour:** not applicable to 002. Food RPC failures surface through 003/004.

## T9. Split, AC mapping and task list

**002a (first PR, `feat/002a-food-db-usda-core`, or this branch if the orchestrator prefers):** AC 1 (Foundation, SR Legacy, FNDDS), 6 (sizes reported), 6b, 7, 8, 9 and 12 (rules as units; pipeline proof in 002b), 10, 13 (USDA = `total`), 14 to 16 (normaliser plus pgTAP lookup; pipeline proof in 002b), 17 to 24, 30 to 40, 42, 45, 46 (USDA and synthetic part), 47, 48, 49, 50 (name part), 51 to 54.
**002b (second PR):** AC 1 (Branded), 2, 3, 4, 4a, 4b, 5, 6a, 11, 13 (OFF inference), 25 to 29, 41, 43, 46 (OFF part), 50 (barcode part), plus pipeline proofs for 8, 9, 12, 14 to 16 on OFF records.
**AC 44:** moved to 011. Binding note in T8.

Each task is independently testable. **C1 is the contract every other task depends on.** After C1, B1/B2 (SQL) and B3 to B5 (tool) can proceed in parallel. M1 needs C1 and B2.

*002a*
- **CONTRACT C1 (backend-engineer, first):** `packages/shared/src/foods.ts` and `gtin.ts` (T4), fully implemented, since they are pure. Tests: every GTIN form and range in T6.1 (AC 14 to 16 unit), schema boundaries (200 ids, 10 servings, 5,000 g, limit 50).
- **BACKEND B1:** migration part 1: schema, enums, role, tables, indexes, RLS, grants, `recompute_canonical`.
  - New pgTAP `food_rls.test.sql`, covering AC 39 and 53:
    - authenticated: select works; insert, update and delete on `food.foods` raise 42501; select on `food.import_runs` and `food.releases` raises 42501;
    - anon: everything raises 42501;
    - `food_importer`: insert and update work, delete raises 42501;
    - RLS enabled on all three tables.
  - New pgTAP `food_structure.test.sql`, covering AC 32 and 42:
    - no FK from any `public` table to `food.foods`;
    - no triggers on `food.foods`;
    - provenance columns are NOT NULL;
    - the unique canonical-per-barcode index exists.
  - New pgTAP `recompute_canonical.test.sql`, covering AC 26 and 29 at SQL level:
    - ordering ties;
    - a hidden canonical hands over to the next member;
    - a cluster with all members hidden has no canonical;
    - re-running gives no change and touches 0 rows;
    - the two-statement swap never violates the index.
- **BACKEND B2:** `get_foods`, `lookup_barcode` and `search_foods` RPCs, including `p_include_off`. pgTAP `food_rpcs.test.sql`:
  - hidden row by id;
  - only canonical rows by barcode;
  - restricted codes not returned;
  - `invalid_input` and `too_many_ids` errors;
  - `p_include_off = false` returns the USDA member;
  - anon can't execute;
  - `search_foods` finds an inserted row by partial name.
- **BACKEND B3:** tool scaffold (workspace, tsconfig, eslint, scripts):
  - zod config schemas, plus `config/{markets,rules,budget}.json`;
  - CLI with `parseArgs` and the target-safety rules (T5.2);
  - the download helper with the host allowlist `{fdc.nal.usda.gov, static.openfoodfacts.org}` and User-Agent `TrustTheProcess-food-import/<version> (<contact from env FOOD_IMPORT_CONTACT>)`.

  Unit tests: AC 45 (allowlist, UA, a source scan for non-allowlisted hosts and for competitor names), target-safety refusals, config validation.
- **BACKEND B4:** normalisation and rules (T5.5) as pure modules. Unit tests:
  - AC 7 (egg record, expected values written out);
  - AC 8 to 10, 12, 13 (USDA), 17, 18;
  - AC 19 to 22: each rule passing and failing;
  - AC 23 tiers;
  - AC 24: thresholds come from config only (a test mutates the config).
- **BACKEND B5:** USDA readers: zip and stream-json for Foundation, SR Legacy and Survey; identity (T1 #7); portion labels. Unit tests on fixture records; streaming test with a synthetic 50k-record file to check memory stays flat. AC 1 (generic).
- **BACKEND B6:** engine:
  - work files, DB-state read, diff, content hash, batching and upsert;
  - hide and unhide, mass-removal guard, advisory lock, preflight;
  - dry run, fault hook, finalise and persisted run report.

  Pipeline tests against the local DB: AC 30, 31, 33 to 38, 51, 52, 54. AC 37 compares a whole-table digest after a killed run plus re-run against an uninterrupted run.
- **BACKEND B7:** fixtures for USDA generic plus synthetic rows, the golden list (including the Italian staples check), `LICENCES.md`, `cut-fixture`, `load-fixture` and `release-check` (golden and size), the fixture size test, and the CI `food-import` job. Pipeline tests: AC 46 (USDA part), 47, 48, 50 (name).
- **BACKEND B8:** docs and ops:
  - `docs/SETUP.md` "Food data" section: local load; remote run as `food_importer` via the session pooler, including the one-time human-only `alter role food_importer login password …`; the `--confirm-remote` flow;
  - release-check runbook (AC 4b, 6, 49);
  - `.env.example` entries;
  - gitleaks CI step (AC 40);
  - the PRODUCT_SPEC §5 fix in T13 (after human approval).
- **MOBILE M1:** `apps/mobile/src/lib/foodData.ts` plus the architecture grep test, and unit tests with a mocked client (arg validation, `FoodRow` parsing, normalise-before-lookup, env switch). AC 6b.

*002b*
- **BACKEND B9:** USDA Branded reader: latest per GTIN, discontinued and market filter, Branded serving rules. Pipeline: AC 1 (Branded), AC 2 (as reinterpreted in T12.1).
- **BACKEND B10:** OFF reader:
  - JSONL streaming and the allowlist projection;
  - schema 1003+ and legacy shapes;
  - `product_type` check, names and languages, markets, as-sold selection;
  - carb basis (T6.4) and OFF tier.

  Unit and pipeline tests: AC 3, 4 (changing the config changes the result), 4a (with `gb` enabled in a test config, since UK is off for beta), 5, 11, 13 (OFF), 41 (sentinel strings: a scan of every text and jsonb column in every table finds none).
- **BACKEND B11:** cross-source clustering in the plan phase (canonical preview for budget) and the full pipeline through `recompute_canonical`. Pipeline: AC 25 to 29, 50 (barcode in three forms).
- **BACKEND B12:** budget: size model and calibration on the fixture, popularity (T2.4), selection and `over_budget` hides, the 450 MB ceiling, measured sizes and failure at more than 10 percent. Pipeline: AC 6a using a tiny budget in a test config (drop order and counts in the report, failure path); AC 6 report fields.
- **BACKEND B13:** separability migration (`food.off_foods`, `food.remove_off_data()`). pgTAP `off_separability.test.sql`, run in a transaction and rolled back: removes exactly the OFF rows; USDA rows unchanged (digest compared); a stand-in `public` user table is unchanged; canonical moves to the USDA member. AC 43.
- **BACKEND B14:** OFF and Branded fixtures and the v2 data, the Italian barcode list file, `release-check italian-barcodes` (AC 4b), and runbook updates. AC 46 (OFF part).

**Task count: 16** (002a: C1, B1 to B8, M1 = 10; 002b: B9 to B14 = 6).

## T10. Test plan (every AC)

Layers: **unit** (vitest in `tools/food-import` or `packages/shared`), **pipeline** (vitest plus the local Supabase DB, CI job `food-import`), **pgTAP** (CI job `database`), **jest** (mobile), **release** (operator runs against the full real files; not in CI). There is no component or Maestro testing, since there are no screens.

| AC | Unit | Pipeline | pgTAP | Release / other |
|---|---|---|---|---|
| 1 | dataset detection | rows with source `usda` from the four datasets, with dataset and release (002a: three; 002b: Branded) | provenance NOT NULL | full run report |
| 2 | latest-per-GTIN selection | one row per GTIN with the latest values; older counted `superseded` (T12.1) | | |
| 3 | each skip reason | only the conforming product stored; distinct report counts | | |
| 4 | config schema | changing `markets.json` changes the imported set | | |
| 4a | name and language choice | IT-only stored `it`; both names give en display and it alt; IT-only name sold in UK skipped `no_accepted_name` (gb enabled in test config) | | |
| 4b | | | | `release-check italian-barcodes` ≥ 90 percent, misses with reasons |
| 5 | product_type and filename detection | not-food file refused, DB unchanged | | |
| 6 | report schema | report has per-tier counts and sizes | | full-run sizes against budget |
| 6a | estimator, ordering | tiny budget: drop order (US non-canonical, then US by popularity, then IT), counts, failure above +10 percent; ceiling abort | | first real run: actual/estimated |
| 6b | | | | jest architecture grep test; M1 unit tests |
| 7 | egg record exact values | | | |
| 8 | kJ conversion, both present | OFF kJ-only record (002b) | | |
| 9 | salt to sodium | OFF record (002b) | | |
| 10 | null vs 0 | stored null vs 0 | | |
| 11 | set selection | prepared-only skipped; as-sold values stored | | |
| 12 | per 100 ml | flag stored | | |
| 13 | USDA total; OFF inference table | carbs_basis per fixture row | enum, NOT NULL | |
| 14 | three forms give one key | lookup by each form returns the same food (002b) | `lookup_barcode` by GTIN-14 | |
| 15 | bad check digit, letters, length | stored without barcode, `invalid_barcode` | | |
| 16 | every range in T6.1 | stored, not clustered, flagged | lookup excludes restricted | |
| 17 | trim, collapse, caps, NFC, truncate | | | |
| 18 | portion labels, bounds, max 10 | servings stored | jsonb length check | |
| 19 | each reject code | rejected counts | value checks | |
| 20 | Atwater flag, reject and alcohol skip | | | |
| 21 | each soft flag | stored `community` with code | | |
| 22 | all-zero passes | | | |
| 23 | tier table | one tier per row | NOT NULL | |
| 24 | pass/fail per rule; config-driven thresholds | | | |
| 25 | | USDA and OFF same GTIN in different forms: both stored, one canonical | unique canonical index | |
| 26 | canonical comparator | re-run keeps the canonical | `recompute_canonical` ordering and idempotence | |
| 27 | | | lookup and search return canonical only; `get_foods` returns non-canonical | |
| 28 | | similar names without a shared barcode are not linked | | |
| 29 | | canonical removed upstream hands over; all hidden gives none | SQL handover | |
| 30 | | second run: 0/0/0, `updated_at` unchanged | | |
| 31 | | v2: same id, new values, later marker | | |
| 32 | | | no FK or trigger from food to user tables (003 adds the diary snapshot test) | |
| 33 | | absent gives `removed_upstream`, still readable by id; re-appears visible | `get_foods` hidden by id | |
| 34 | | newly failing gives hidden with code, values kept | | |
| 35 | | partial mode hides nothing | | |
| 36 | guard maths | more than 10 percent stops before write; override proceeds | | |
| 37 | | fault after N batches, re-run: digest equals uninterrupted | | |
| 38 | preflight messages | missing field, CSV given, corrupt zip: abort, DB unchanged | | |
| 39 | | | authenticated read only; writes 42501; anon none | |
| 40 | target-safety refusals | | | gitleaks CI step; web export has no `FOOD_IMPORT` or `postgresql://` |
| 41 | projection drops fields | sentinel strings absent from every column | | |
| 42 | | every row has source, ref, dataset, release, run | NOT NULL, FKs | |
| 43 | | | `remove_off_data` in a rolled-back transaction | |
| 44 | — | — | — | moved to 011; binding via `includeOff` default false (M1 test) |
| 45 | host allowlist, UA, source scan | | | |
| 46 | fixture ≤ 5 MB, licence manifest present | fixture covers rules (test per rule references a fixture row) | | |
| 47 | | `load-fixture` from empty DB, no network | | documented in SETUP |
| 48 | golden schema | every golden entry visible, `verified`, in range, with serving | | |
| 49 | | | | `release-check golden` on full USDA |
| 50 | | barcode in three forms; name query per golden entry | `search_foods` | |
| 51 | reconciliation | report fields and reconciled = true | | |
| 52 | | dry run: counts and markers identical before and after | | |
| 53 | | report contains no user ids | `import_runs` not readable by clients | log scan in pipeline test |
| 54 | | select by `last_run_id` returns exactly the changed rows | index exists | |

## T11. Risks and how we'll know

| # | Risk | Signal | Mitigation |
|---|---|---|---|
| R1 | Size estimate is wrong (synthetic calibration, unknown pass rates) | `actualOverEstimated` outside 0.9 to 1.1; T2 counts differ by more than 30 percent | Recalibrate `budget.json` after the first dry and full run. The ceiling guard protects in between. |
| R2 | Free project goes read-only (over 500 MB) | `dbTotalBytes` approaching 450 MB; writes fail with SQLSTATE 25006 | 450 MB ceiling; budget at 90 percent target; plan the Pro upgrade at M2 (ADR 0008). |
| R3 | Initial load fills the 1 GB Free **disk** with WAL (not counted in database size) | Supabase dashboard disk usage; `pg_ls_waldir` total (operator as postgres) | Load in stages (generic, then IT, then US) with `--throttle-ms`. If needed, the human runs the first load with the trigram index created afterwards (a one-off, human-confirmed step). |
| R4 | OFF schema still changing (1003 "under active development", 1004 tags refactor); mixed legacy and new shapes | `parseErrorRate` > 0.1 percent; run fails above 1 percent | zod-pinned projection; failures name the field; update schemas (AC 38 behaviour). |
| R5 | OFF tier signal is weak (nearly all `brand`) | `foodsByTier.off.brand` above 95 percent | H3: stricter criterion after the first run. |
| R6 | Barcode edge cases: UPC-E stored unexpanded, the same product under two codes, GTIN reuse | 004 scan misses for known products; clusters with odd members | Add UPC-E expansion in 004 if scans show it; report the top cluster sizes. |
| R7 | Italian coverage below target (names only in other languages, missing core nutrients) | AC 4b below 90 percent; `skippedBySelection.no_accepted_name` for IT | Accept more name languages for Italy? (human); live lookup in 004. |
| R8 | USDA popularity signal sparse (few Branded GTINs scanned on OFF) | Share of US Branded candidates with `scans = 0` above 70 percent | Ties fall back to manufacturer-supplied and most recent. Consider category quotas later. |
| R9 | Import slows the app (Free compute) | App p95 latency and Supabase CPU graph during a run | `--throttle-ms`, off-peak runs, smaller batches. |
| R10 | Foundation and SR Legacy duplicates of the same generic food crowd search | 003 golden-search results showing near-duplicates | Out of scope (no name merging, AC 28); 003 ranking or 009. |
| R11 | Real fixture records can't be cut from the agent environment | B5/B7 blocked on golden USDA rows | H1: the human runs `cut-fixture` once; synthetic, upstream-shaped records until then. |
| R12 | Refresh churn causes bloat | `deadTuples` in report; size grows between runs with stable counts | Hash-diff writes only; VACUUM in finalise. `VACUUM FULL` only with human confirmation. |
| R13 | Two catalogue projects later (AC 6b fallback) need auth for food reads | Decision at that time | Access module isolates callers; noted in ADR 0006. |

## T12. Spec ambiguities resolved by the architect
1. **AC 2 with stable identity:** a Branded product is one row keyed by GTIN. Within a file, older versions of the same GTIN are not stored but are counted `superseded` in the report. Across releases, the same row is updated in place (AC 31). `superseded` remains a hide reason for the case where a GTIN's row is replaced by a different `source_ref` (e.g. a fallback `fdc:` row once its GTIN becomes valid). This differs from AC 2's literal "the older one is hidden"; it is needed for AC 31 and AC 33 to hold on real USDA data. H4.
2. **Budget order details:** within each market group, non-surfacing rows (non-canonical cluster members, superseded) are dropped before surfacing ones. This is consistent with AC 6a's "least useful first" and keeps AC 25's "both stored" true whenever the budget allows (always on the fixture).
3. **Deselected rows:** a stored OFF product that drops out of selection (no longer in a market, a market switched off) is hidden as `not_selected`. It is never deleted.
4. **Hidden rows keep their last good values** when they become hidden because they fail a rule (AC 34). They update again when they pass.
5. **Name length limit:** 200 code points for names, 120 for brands, 80 for serving labels.
6. **AC 32** can only be proven structurally in 002, because `diary_entries` doesn't exist yet. 003 adds the snapshot pgTAP once the table exists.
7. **AC 40:** the CI secrets check is added by B8, because it doesn't exist today.
8. **AC 11 wording:** prepared-only products are counted under `missing_core` (with a sub-count `prepared_only`).
9. **Run reports for dry runs** go to a file only (AC 52 forbids DB changes).

## T13. Proposed documentation fixes (for the human to approve; not edited by the architect)
- **PRODUCT_SPEC §5, USDA row:** replace "Public domain (CC0)" with "U.S. Government public domain (data.gov label: U.S. Public Domain, https://www.usa.gov/publicdomain/label/1.0/); not CC0. Suggested citation per FDC." Also list "Foundation, SR Legacy, FNDDS, Branded".
- **PRODUCT_SPEC §5, OFF row:** replace "keep OFF data in a separate table" with "keep OFF-derived data separable: identifiable, exportable and removable as a unit (ADR 0006)".
- **ARCHITECTURE.md:** done in this stage (data model, "operator-run imports").

## T14. Needs a human decision (defaults applied)
**Decided (human, 2026-10-20 19:50): H1–H6 defaults accepted, T13 doc fixes approved (B8 applies them). 002a is built on this branch (`feat/002-food-db-import`); 002b gets its own branch after 002a merges.**

- **H1: Real fixture records.** The agent environment can't download from the USDA or OFF hosts. **Default:** engineers build upstream-shaped synthetic records (from the documented schemas and OFF's GitHub test data) so B4 to B6 can proceed. Before 002a QA, you run `pnpm food:cut-fixture` once on your machine with real downloads (about 30 min, about 4 GB disk) so the golden USDA rows are real.
- **H2: OFF scan counts rank USDA Branded** for the budget. The values are never stored on USDA rows, so OFF stays separable. **Default:** yes.
- **H3: OFF tier criterion.** `en:nutrition-facts-completed` turns out to be set for nearly every product with entered nutrition, so most OFF rows will be `brand`. **Default:** implement as decided at Gate 1, report the share, and revisit after the first full run. The alternative is `brand` only when the as-sold set's source is `manufacturer`.
- **H4: AC 2 reinterpretation** (T12.1) and dropping non-surfacing rows first under the budget (T12.2). **Default:** yes.
- **H5: Remote operations are yours.** You enable `food_importer` login once on the Free project (`alter role food_importer with login password '…'` in the SQL editor), store the URL only on your machine, and run the first remote import yourself with `--apply --target remote --confirm-remote <ref>`. Applying the migrations remotely (`supabase db push`) also needs your confirmation. Agents never do any of this.
- **H6: Split** into 002a/002b, with USDA Branded moved to 002b (differs from Q14's suggested cut). **Default:** split as in T9. The orchestrator decides whether 002a stays on this branch.

---

# Backend notes

## Backend notes: C1 (shared contract, 2026-10-20)

Files: `packages/shared/src/foods.ts`, `gtin.ts`, `foods.test.ts`, `gtin.test.ts`; `index.ts` re-exports both. No new dependencies.

Command output summary (`pnpm install --frozen-lockfile` was needed first; node_modules was missing):
- `pnpm --filter @ttp/shared test`: 9 files, 203 tests passed (new: gtin 47, foods 19).
- `pnpm --filter @ttp/shared typecheck`: clean.
- `pnpm --filter @ttp/shared lint`: clean.
- `pnpm exec prettier --check packages/shared docs/specs`: clean.
- `supabase test db` not run: C1 has no SQL.

Coverage: all GTIN forms (UPC-A, EAN-13, GTIN-14, EAN-8, 9 to 11 digit padding, whitespace), failures (`non_numeric`, `bad_length`, `bad_check_digit`), every restricted range in T6.1 with both edges and neighbours, and boundaries 200/201 ids, 10/11 servings, 5,000/5,000.01 g, limit 50/51.

### Open questions (conservative reading applied; the architect should confirm)
1. **GTIN-14 with a non-zero indicator digit and restricted ranges.** T6.1 checks prefixes on `0` + GTIN-13 only. Applied literally: an indicator-digit GTIN-14 is never restricted, even if the inner item is an in-store code. Alternative is to test the inner GTIN-13 (digits 2 to 13).
2. **`isRestrictedGtin14` cannot see the original length.** A GTIN-8 is recognised as a key starting with six zeros (GS1 reserves the colliding GTIN-13 range, T6.1), then restricted if it starts with 0 or 2.
3. **`kind` for 9 to 11 digit codes** is `'gtin13'` (the union has no padded kind); T6.1 says they are padded to 13.
4. **Whitespace:** all whitespace is removed, including internal (reading of "strip whitespace"). An empty or blank string returns `non_numeric`, not `bad_length`. Non-ASCII digits are `non_numeric`.
5. **All-zero codes** (for example `00000000`) pass the check digit and normalise (as a restricted GTIN-8). Not specified; left as is.
6. **`FoodRow.reasons`** is typed as `FoodFlagCode[]` (soft flags only), so a row carrying a hide reason in `reasons[]` would fail parsing. This matches T3's comments ("soft flags stored in reasons[]"), but the SQL column type is the full `reason_code[]`; B2/M1 must keep hide reasons out of `reasons`.
7. **`FoodRow.hidden`** is exposed as a boolean; `hidden_reason` is not in the T3 column list, so it is not in the contract.

---

# Mobile notes

## Mobile notes: M1 (food data access module, 2026-10-20)

Files: `apps/mobile/src/lib/foodData.ts`, `foodData.test.ts`, `foodData.architecture.test.ts`; `apps/mobile/src/test/nodeShim.d.ts` (minimal `node:fs`/`node:path` typings for the architecture test, so the app needs no `@types/node`); `.env.example` (two optional vars). No UI, no routes.

API: `getFoods(ids)`, `lookupBarcode(raw)`, `searchFoods(query, limit?)`, `FoodDataError` (`code`: `too_many_ids | invalid_input | invalid_args | invalid_response | request_failed`), `includeOff` (const, `false` until 011), `resolveFoodClient(env, fallback, create?)` and `hasSeparateFoodProject` (env switch, exported for tests).

Behaviour:
- Args are validated with the C1 schemas (`GetFoodsArgs`, `LookupBarcodeArgs`, `SearchFoodsArgs`) before any call; results are parsed with `FoodRow.array()`. A bad row throws `invalid_response`. `FoodRow.reasons` holds soft flags only and `hidden_reason` is not in `FoodRow` (C1 notes 6 and 7), so a hide reason in `reasons` fails parsing.
- `lookupBarcode` runs `normaliseGtin` first. Invalid or restricted (in-store) codes return `null` with no network call; UPC-A, EAN-13 and GTIN-14 forms send the same `p_gtin14`.
- Env switch: a client is created from `EXPO_PUBLIC_FOOD_DATA_URL` + `EXPO_PUBLIC_FOOD_DATA_PUBLISHABLE_KEY` only when both are non-blank (anonymous, no session persistence, since a second project cannot verify the main project's JWTs, ADR 0006); otherwise the main `supabase` client. The client is resolved lazily on first call.
- Architecture test: walks `apps/mobile/src` and fails if any file other than `lib/foodData.ts` (and its two tests) contains `get_foods`, `lookup_barcode`, `search_foods` or `schema('food')`.

Results: `jest` 25 suites, 304 tests (new: 2 suites, 29 tests: 26 in foodData.test.ts, 3 in the architecture test); `tsc --noEmit` clean; `expo lint --max-warnings 0` clean; prettier clean on `apps/mobile`.

Deviations and points for the backend/architect:
1. **`p_include_off` is sent on every call** (`false` today), per T8. The C1 arg schemas are `strictObject` and do not include it, so the module validates with the C1 schemas and then adds the flag itself. B2 must accept `p_include_off boolean default false` on all three RPCs, or PostgREST will reject the unknown argument. Suggest adding it to the C1 schemas as optional in a follow-up.
2. **Defence in depth:** rows with `source = 'off'` are also dropped client-side while `includeOff` is false (AC 44).
3. `getFoods([])` returns `[]` without a call (the C1 schema requires at least 1 id). More than 200 ids throws `invalid_args`; callers chunk.
4. Server errors are mapped by substring match of `too_many_ids` / `invalid_input` in the message; this assumes B2 raises with those words as the message (T3).
5. `lookup_barcode` is read as a `setof` (array of 0 or 1 rows).
6. Hand-typed `FoodRpcClient` interface plus one `as unknown as` cast at each of the two client boundaries (supabase-js `rpc` is generically typed against a database type we do not generate).
7. Web/iOS/Android: no native APIs used; the module only uses supabase-js, so it behaves the same on all three. Not run on a device or browser in this task.
8. `pnpm install --offline` was run to undo an accidental `@types/node` add; `pnpm-lock.yaml` and `pnpm-workspace.yaml` differ from HEAD because of the backend's `tools/*` workspace, not because of M1. M1 adds no dependency.

## Backend notes: B1/B2 (SQL, 2026-10-20)

Files: `supabase/migrations/20261021090000_food_catalogue.sql`; pgTAP `supabase/tests/food_rls.test.sql` (33), `food_structure.test.sql` (46), `recompute_canonical.test.sql` (28), `food_rpcs.test.sql` (56) = 163 new assertions.

Command output summary:
- pgTAP on the stand-in (throwaway local Postgres 16 + pgTAP + minimal auth stub, `/var/tmp/pgsim/run-repo.sh`; the 001 harness had to be rebuilt, pgTAP installed with apt): all 3 migrations apply; 9 files, 318 `ok`, 0 `not ok` (155 existing + 163 new). The `supabase` CLI is not installed here, so real Supabase (PG17, `grant maintain`, PostgREST, `supabase db lint`) is verified only in CI.
- `pnpm --filter @ttp/shared test`: 9 files, 203 tests passed. `typecheck`, `lint`: clean. `prettier --check packages/shared docs/specs`: clean (run before this note was appended).

Contract with M1 (orchestrator message): all three RPCs take `p_include_off boolean default false`; errors are raised as the bare messages `too_many_ids` / `invalid_input` (SQLSTATE P0001); `lookup_barcode` returns 0 or 1 rows. Signatures: `get_foods(p_ids uuid[], p_include_off)`, `lookup_barcode(p_gtin14 text, p_include_off)`, `search_foods(p_query text, p_limit int default 20, p_include_off)`.

### Deviations and additions (record for review)
1. **`food.is_restricted_gtin14(text)`** (SQL twin of `isRestrictedGtin14`, parity-tested on the gtin.test.ts cases) and **`food.soft_flags(reason_code[])`** are small helpers not in T3. The first guards `lookup_barcode` (restricted input returns no row); the second implements C1's "reasons = soft flags only" by filtering hide reasons out of the returned array. No table or column was added.
2. **RPC shape follows C1:** returns the 24 `FoodRow` columns only (`hidden` = `hidden_reason is not null`, `hidden_reason` not returned). Enum columns are returned as the `food.*` enum types (JSON strings over PostgREST). `real` columns serialise as plain numbers.
3. **`lookup_barcode` with `p_include_off = false`:** if the cluster canonical is OFF, the best visible non-restricted USDA member is returned (T8 wording). `search_foods` does not do this (it needs `is_canonical` for the trigram index), so a USDA row whose canonical is OFF is not searchable until OFF is included. Irrelevant in 002a (no OFF data); 002b/003 should decide.
4. `p_limit` above 50 is capped (not an error); below 1 raises `invalid_input`. `p_ids` null raises `invalid_input`, empty returns nothing. `get_foods` returns rows in the order of the requested ids.
5. `recompute_canonical` adds `id` as a final ordering tie-break (after `source_ref`) so the choice is total; it returns the number of changed rows.
6. `create role food_importer` and `grant maintain` are guarded (role exists; PG17 only). A best-effort `grant food_importer to <migration user> with set true` lets `postgres` run `set role food_importer` (PG16+ non-superuser creators lack SET); failure only warns. Checked on a non-superuser role in the stand-in, not on real Supabase.
7. pgTAP tests `grant usage on schema extensions to food_importer` (rolled back) so the importer can call pgTAP helpers; the migration does not.

### Open questions
- Add `check (reasons <@ soft flags)` on `food.foods`? Currently only the RPC filters; a CHECK would make the invariant database-enforced (schema change, so not done).
- C1's `SearchFoodsArgs` / `GetFoodsArgs` / `LookupBarcodeArgs` are strict objects without `p_include_off`; M1 sends it, so C1 may need the optional field.
- The architect's T3 file said `grant maintain` unconditionally; that fails on PG16 (the stand-in), hence the guard.

## Backend notes — B3/B4/B5 (importer scaffold, rules, USDA readers, 2026-10-20)

Scope: `tools/food-import` (new workspace package `@ttp/food-import`), plus wiring in `pnpm-workspace.yaml` (`tools/*`), root `package.json` (`food:import`, `food:load-fixture`, `food:cut-fixture`, `food:release-check`), `.gitignore` (`tools/food-import/.work/`, `.reports/`) and `pnpm-lock.yaml`. Nothing under `supabase/` or `apps/mobile` was touched. No commit, no push.

**What exists**
- B3: zod config schemas and `config/{markets,rules,budget}.json`; manifest schema; `parseArgs` CLI (`args.ts`, `cli.ts`); target safety (`target.ts`); download helper with host allowlist and User-Agent (`download.ts`); deterministic ids (`identity.ts`).
- B4: pure rules in `src/rules/`, one file per rule (`missing-core`, `negative-value`, `mass-over-100g`, `energy-too-high`, `energy-implausible`, `energy-atwater-mismatch`, `sugars-over-carbs`, `satfat-over-fat`, `sodium-implausible`), plus `energy`, `sodium`, `names`, `servings`, `tier` and `applyRules`. Thresholds are read only from `RulesConfig`.
- B5: `src/usda/` with pinned zod shapes, nutrient map, portion labels, `normaliseUsdaGeneric`, and the zip/plain-JSON streaming reader (`yauzl` + `stream-json` `pick` + `streamArray`) with a top-level-key preflight.
- Not built (later tasks): DB access (`pg`), engine, work files, content hash, report schema, fixtures, `load-fixture`/`cut-fixture`/`release-check`. These CLI commands validate the target and then exit 2 with "not built yet (B6/B7)". `food-import import` therefore does nothing yet.

**Commands and results**
- `pnpm --filter @ttp/food-import test`: 11 files, 122 tests passed (config/manifest 7, target 9, args 4, cli 6, download 14, clean-room scan 3, rules 38, usda normalise 21, portions 5, reader 14 incl. bad-input cases, streaming 1). Duration about 30 s, almost all in the streaming test.
- `pnpm --filter @ttp/food-import typecheck` (tsc --noEmit), `lint` (eslint src test): clean.
- `pnpm exec prettier --check .` (whole repo): clean.
- Repo-wide `pnpm test`: 5/5 tasks successful (shared 9 files, food-import 11 files, mobile 25 suites / 304 tests). `pnpm typecheck` and `pnpm lint`: all tasks successful. One earlier run had `mobile adjust.test.tsx` fail 14 tests while the 50k streaming test ran in parallel (CPU contention, timeouts); it passes alone and in the next full run. Watch for flakiness in CI if the runner is small.
- `supabase test db` not run (no SQL in this slice).

**Streaming test (B5)**: `test/streaming.test.ts` spawns `test/scripts/stream-memory.ts` with `--expose-gc`. It writes a synthetic zipped Foundation-shaped file of 50,000 records (81 MB uncompressed, 1.9 MB zipped; streaming zip writer in `test/helpers/zip.ts`) and reads it through zip, stream-json, zod and the normaliser. Heap after GC, sampled every 5,000 records: 12.5 MB baseline, then 12.8 to 13.9 MB throughout (growth after the first sample well under 1 MB; the test allows 15 MB). All 50,000 records become candidates.

**Synthetic data (H1)**: all USDA records used in tests are hand-written, upstream-shaped and marked SYNTHETIC in `test/helpers/synthetic-usda.ts` (including the whole-egg record with approximate values). The zod shapes in `src/usda/schemas.ts` and the nutrient ids in `src/usda/nutrients.ts` are NOT verified against real files. The human must re-pin them against real records when running `cut-fixture` (check in particular: `ndbNumber`/`foodCode` types, `publicationDate` format, portion `modifier` and `portionDescription` content per dataset, nutrient ids 1008/2047/2048/1062/2000/1063/1079/1258/1093/1018, and that `unitName` is upper-case "G"/"MG"/"KCAL").

**Deviations from the plan**
1. **tsconfig uses `module: ESNext` and `moduleResolution: Bundler`, not NodeNext (T5.1).** `packages/shared/src/index.ts` uses extensionless relative imports, which NodeNext rejects (TS2835). Changing shared was out of scope. stream-json 3 resolves fine under Bundler. Runtime is `tsx`/vitest, which handle both.
2. `stream-chain` is not a direct dependency: the reader uses `node:stream` `pipeline` with `pick.withParserAsStream` and `streamArray.asStream`, so backpressure and error propagation come from Node. `pg` and `@types/pg` were not added (first needed in B6). `@types/node` is `^26.6.5` (the version already in the lockfile) to avoid re-resolving mobile's jest peers; runtime Node here is 22.
3. `budget.json` sizes: 300 MB = 314,572,800 bytes, ceiling 450 MB = 471,859,200 bytes (binary megabytes). `baseNameAllowance` values (58 generic, 40 branded and Italy) are placeholders taken from T2.1's average name lengths; B12 fits them.
4. Hide-reason names are the `FoodHiddenReason` enum from C1; `RejectReason` in `src/rules/index.ts` is its six reject members including `no_name`. `no_name` is checked first (before nutrients), not last as listed in AC 19; only matters for which single reason a multiply-broken record is counted under.
5. `FOOD_ID_NAMESPACE` (`src/identity.ts`) is a fresh random UUID chosen by me; ADR 0006 names the constant but gives no value. It must never change after the first import.
6. The `download` command requires `--url` for USDA datasets (file names carry the release date and I could not read the download page). For OFF it defaults to the `static.openfoodfacts.org` JSONL dump URL from T6.2, which is unverified. Redirects are followed manually and each hop is re-checked against the allowlist and the dataset's own host. The User-Agent is sent on every download request.
7. The FOOD_IMPORT_FAULT_AFTER_BATCHES hook is a pure function that throws if set with a remote target (instead of ignoring it); the engine will call it.

**Open questions (architect / human)**
1. **Which flags demote a row to `community` (AC 20, 21, 23)?** T5.5 says "any soft-flagged row is community" but all 9 `FoodFlagCode`s live in `reasons[]`. I treat only the five quality flags (`energy_atwater_mismatch`, `sugars_over_carbs`, `satfat_over_fat`, `sodium_implausible`, `energy_unit_mismatch`) as demoting. `energy_from_kj`, `volume_basis_assumed`, `invalid_barcode` and `restricted_barcode` are informational and keep the tier (a kJ-only Foundation row stays `verified`). Literal reading would make those four demote too. Confirm; it is one set in `src/rules/tier.ts`.
2. **Atwater relative deviation base.** AC 19/20 do not say "percent of what". I use the Atwater estimate (deviation / estimate; estimate 0 with any deviation counts as infinite relative). Using the stated energy instead would change borderline rows. Confirm.
3. **Alcohol "reported" (AC 20).** Atwater checks are skipped only when alcohol is known and greater than 0 (USDA often publishes 0). If you want any published alcohol value (even 0) to skip, change `atwaterEstimate`.
4. **Energy unit mismatch denominator.** The 10 percent test uses the larger of the stated kcal and kJ/4.184. Two zeros are consistent. Confirm or specify.
5. **USDA portion labels.** Pinned from the documented fields only: `portionDescription` is used verbatim when present (placeholder "Quantity not specified" dropped); otherwise `amount unit, modifier` with "undetermined" units and purely numeric modifier codes omitted; portions with neither unit nor modifier are dropped. Real Foundation/SR/FNDDS records may need adjustments (T5.5 already says the engineer derives them from fixtures); re-check after `cut-fixture`. Labels are not re-cased.
6. **`source_ref` fallback `fdc:<fdcId>`** is used for Foundation/SR/FNDDS records without `ndbNumber`/`foodCode` (T1 #7 only specifies the fallback for Branded). Such a row would change identity if the stable key later appears.
7. **Name case conversion** (sentence case for names, title case for brands, 4+ letters and no lower-case letter) is crude: acronyms inside an all-caps name are lower-cased ("USDA" in "USDA COMMODITY" is only protected when the whole name is under 4 letters). Acceptable per AC 17, flagged for the golden-list review.
8. **Content hash, `RunReport` schema and `Manifest` semantics** beyond shape (file existence, sha256, `food.releases` writes) are left to B6. `NormalisedFood` in `src/types.ts` is my proposed engine input and is not yet used by anything but the USDA normaliser; B6/B10 may reshape it.
9. **Secrets scan / CI**: the new package adds a vitest streaming test that spawns a child process (about 25 s). B7's CI job `food-import` and the existing `app` job both run `pnpm test`; confirm that is acceptable for the `app` job's time budget, or move the streaming test behind a separate script.
