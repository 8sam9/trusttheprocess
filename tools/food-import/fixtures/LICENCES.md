# Fixture licences and provenance

Everything in this folder is test data for `tools/food-import`. It makes `pnpm food:load-fixture`, CI and agents
work without downloading gigabytes. Nothing here is shown to users.

## Status of the data (read this first)

- **Rows marked `x_synthetic: "golden-placeholder"` are SYNTHETIC.** They carry the real USDA description of a
  common food (so they can be found and later replaced) but the numbers were written by hand from general
  knowledge. They are NOT USDA data. The agent environment cannot reach the USDA hosts (spec H1).
- **Rows marked `x_synthetic: "rule-row"` are permanent, purpose-built test rows** (`source_ref` starts with
  `synthetic-`, names start with "Test "). They exercise every rule in AC 8 to 22 and the update, removal and
  newly-failing cases of AC 30 to 36. They stay when real data is cut.
- Once the human has run `pnpm food:cut-fixture` (see docs/SETUP.md, "Food data"), the placeholders are replaced by
  real records, each file's `_fixture` block says `"synthetic": false` and names the upstream release, and this
  file stays accurate.

## Per source

| Part                                           | Source                                                             | Licence                                                                                                                                                                                                      | Notes                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usda/*.json` real records (after cut-fixture) | USDA FoodData Central: Foundation Foods, SR Legacy, FNDDS (Survey) | U.S. Government public domain (data.gov label "U.S. Public Domain"; not CC0). Suggested citation per FDC: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov. | Pruned to the fields the importer reads. Release, file name and SHA-256 are recorded in `manifest.*.json` under `meta` and in each file's `_fixture` block. |
| `usda/*.json` synthetic rows                   | Written for this repository                                        | Ours (same licence as the repository)                                                                                                                                                                        | See "Status of the data".                                                                                                                                   |
| `golden-list.json`                             | Written for this repository; descriptions follow USDA wording      | Ours                                                                                                                                                                                                         | Reference ids and ranges are re-pinned from real data by cut-fixture.                                                                                       |
| Open Food Facts files (`off/*`)                | Open Food Facts                                                    | ODbL 1.0 for the database, DbCL 1.0 for the contents. "Contains data from Open Food Facts, available under the Open Database License."                                                                       | Not present yet: they arrive with spec 002b. An OFF extract stays under ODbL.                                                                               |

No data from any commercial or competing food database is used anywhere in this folder (ADR 0002).
