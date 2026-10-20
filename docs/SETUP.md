# Local setup

## 1. Tools (macOS)
| Tool | Install | Check |
|---|---|---|
| Node 24 LTS (22+ works) | `brew install node@24` (or nvm, see `.nvmrc`) | `node -v` |
| pnpm | `corepack enable` | `pnpm -v` |
| Docker Desktop | https://www.docker.com/products/docker-desktop/ (needed by local Supabase) | `docker ps` |
| Supabase CLI | installed by `pnpm install` (run via `pnpm exec supabase`), or `brew install supabase/tap/supabase` | `pnpm exec supabase -v` |
| Expo Go | App Store / Play Store on your phone | |
| EAS CLI (later, for builds) | `npx eas-cli@latest login` | |

## 2. First run
```bash
pnpm install
pnpm db:start                 # starts Postgres, Auth, Studio, Mailpit in Docker; applies migrations
pnpm db:test                  # pgTAP tests (RLS) — must be green
cp .env.example apps/mobile/.env.local
# put the "Publishable key" printed by db:start into EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
pnpm dev                      # then press w (web), i (iOS simulator) or scan the QR with Expo Go
```
Sign in with any email. The 6-digit code lands in the local mail catcher (Mailpit): http://127.0.0.1:54324.
Supabase Studio (database UI): http://127.0.0.1:54323.

**Privacy policy URL:** set `EXPO_PUBLIC_PRIVACY_URL` (in `.env.local` and per EAS environment). Unset in development, the consent link goes to a placeholder and the console warns; a production build without it shows "Privacy policy coming soon" instead of a link.

**Testing on a real phone:** the phone can't reach `127.0.0.1` on your Mac. Set `EXPO_PUBLIC_SUPABASE_URL=http://<your-mac-LAN-IP>:54321` in `apps/mobile/.env.local`.

## 3. Everyday commands
```bash
pnpm lint && pnpm typecheck && pnpm test   # what CI runs
pnpm db:test                               # database security tests
pnpm db:reset                              # wipe local DB and re-apply migrations
pnpm db:types                              # regenerate DB types into packages/shared (then replace hand-written db.ts)
pnpm exec supabase functions serve         # run edge functions locally
```

## 4. Sign-in providers (when ready)
- **Email code:** works out of the box locally. In production, configure a real SMTP provider (Resend, Postmark…) in the Supabase dashboard; the built-in sender is heavily rate-limited.
- **Apple:** needs an Apple Developer account. Set `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=app.trusttheprocess` and enable `[auth.external.apple]`. Native sign-in needs a development build (`eas build --profile development`), not Expo Go.
- **Google:** create OAuth client ids in Google Cloud Console (Web client for Supabase), put them in `.env` and enable `[auth.external.google]`. `trusttheprocess://auth-callback` is already allow-listed in `config.toml` for local.

## 5. Hosted environments (when the beta starts)
1. Create a Supabase project (EU region) → `pnpm exec supabase link --project-ref <ref>` → `pnpm exec supabase db push`.
2. Deploy functions: `pnpm exec supabase functions deploy delete-account`.
3. `npx eas-cli@latest init` in `apps/mobile`, set the `EXPO_PUBLIC_*` variables per EAS environment.
4. Push the repo to GitHub; CI (`.github/workflows/ci.yml`) runs on every PR.
5. **Spec 001 migration (`20261020090000_onboarding_targets`)** resets `onboarding_completed_at` for all profiles, so it refuses to run if any profile is already completed. Only if you have confirmed that is acceptable (pre-launch data only), opt in for the session: `PGOPTIONS='-c ttp.allow_prelaunch_reset=on' psql "$DB_URL" -f supabase/migrations/20261020090000_onboarding_targets.sql`, or temporarily `alter database postgres set ttp.allow_prelaunch_reset = 'on';` before `supabase db push` and `alter database postgres reset ttp.allow_prelaunch_reset;` afterwards. Never set it once real users exist.

## 6. Food data (spec 002)
The food catalogue (USDA FoodData Central, later Open Food Facts) is filled by an operator-run importer, `tools/food-import`. It reads downloaded files, never calls a search API, and writes only through the database role `food_importer`. Nothing in the app or in CI needs the real files: a small checked-in fixture is enough.

### 6.1 Local: load the fixture (everyone, agents and CI too)
```bash
pnpm db:start            # or pnpm db:reset for a clean database
pnpm food:load-fixture   # about 130 foods from 3 USDA datasets plus the purpose-built test rows; needs no network
```
Run it again at any time: it changes nothing when nothing changed (it prints `new 0, updated 0`). To look at the result, open Studio (http://127.0.0.1:54323) and select from `food.foods`, or call `select * from public.search_foods('egg')` while signed in as an authenticated user.

**What the fixture is today.** The USDA golden foods (`fixtures/golden-list.json`, 127 foods including 25 Italian staples) are SYNTHETIC placeholders until the human runs `pnpm food:cut-fixture` once (section 6.3). The purpose-built test rows (`synthetic-*`, names start with "Test ") are permanent. `fixtures/LICENCES.md` has the licences and provenance.

Tests:
```bash
pnpm --filter @ttp/food-import test            # unit tests (no database)
pnpm --filter @ttp/food-import test:pipeline   # importer end to end against the local database (CI job `food-import`)
```
The pipeline tests EMPTY the `food.*` tables of the local database before each test and again at the end, so run `pnpm food:load-fixture` again afterwards. They refuse any non-loopback database.

Dry run of any file (nothing is written, the report is printed and saved under `tools/food-import/.reports/`):
```bash
pnpm food:import --manifest <manifest.json>            # dry run
pnpm food:import --manifest <manifest.json> --apply    # write to the LOCAL database
```
Manifests list the files, their release label and whether each file is a full snapshot (see `fixtures/manifest.v1.json`). Only a full-mode snapshot input can hide foods that disappeared upstream; a run that would hide more than 10 percent of a source stops and says why (`--allow-mass-removal` overrides, only if you checked the file).

### 6.2 Remote project: HUMAN-ONLY steps
Agents never run any of this (CLAUDE.md: no production deploys or destructive database commands without explicit confirmation).

1. **[HUMAN] Apply the migrations** to the hosted project: `pnpm exec supabase db push` (read the list it prints first).
2. **[HUMAN, once] Enable the importer role.** In the Supabase SQL editor (Free project):
   ```sql
   alter role food_importer with login password '<a long random password>';
   ```
   The migration creates the role without login. The importer never uses the service-role key or the Data API.
3. **[HUMAN] Build the connection URL on your machine only** (Dashboard > Connect > Session pooler; the Free plan's direct connection is IPv6-only). The user name is `food_importer.<project-ref>`, the port is **5432** (the importer refuses 6543, the transaction pooler, because it has no session advisory locks). Put it in `tools/food-import/.env` (gitignored) as `FOOD_IMPORT_DATABASE_URL=...`, and set `FOOD_IMPORT_CONTACT` to your email. See `.env.example`.
4. **[HUMAN] Dry run first, then apply.**
   ```bash
   set -a; source tools/food-import/.env; set +a
   pnpm food:import --manifest <manifest.json> --target remote --confirm-remote <project-ref>            # dry run: read the report
   pnpm food:import --manifest <manifest.json> --target remote --confirm-remote <project-ref> --apply    # writes
   ```
   `--confirm-remote` must equal the project ref inside the URL, typed by you. Load in stages (generic USDA first, then Italy, then the rest) with `--throttle-ms 200` on the Free plan, and off-peak, because a multi-hour load competes with the app for CPU, and WAL counts against the 1 GB disk (spec risk R3).
5. **[HUMAN] Read the report.** It lists rows read, new, updated, unchanged, hidden, un-hidden, flagged and rejected per reason, the food data size against the 300 MB budget, and the free space left for user data. A run that ends more than 10 percent over budget is marked failed.
6. **[HUMAN] Release check** against the remote data (section 6.4).
7. **[HUMAN, if ever needed] Removing data** (for example OFF-derived rows) is a separate, confirmed step that belongs to spec 002b; the importer role cannot delete.

### 6.3 Cut the real fixture (HUMAN, once, about 15 minutes, needs about 1 GB of disk and internet)
This replaces the synthetic golden placeholders with real USDA records. It downloads Foundation Foods, SR Legacy and FNDDS (JSON zips) from `fdc.nal.usda.gov`, keeps only the golden foods and a small deterministic sample, prunes them to the fields the importer reads, rewrites `tools/food-import/fixtures/`, and prints what you or the engineer must re-pin.
```bash
cd <repo>
pnpm install
pnpm food:cut-fixture
```
That is the whole command. If the automatic download cannot find the files, it tells you exactly what to do by hand: download the three JSON zips from https://fdc.nal.usda.gov/download-datasets (Foundation Foods, SR Legacy, FNDDS "Survey") into one folder and run `pnpm food:cut-fixture --from <that folder>`. Files are cached in `tools/food-import/.work/downloads`, so a re-run does not download again.

Read the output at the end:
- `NOTHING TO RE-PIN`: run `pnpm test && pnpm food:load-fixture && pnpm food:release-check --checks golden,size`, then commit `tools/food-import/fixtures/`.
- `NEEDS YOUR ATTENTION`: each line names the file or field to fix (a golden entry that was not found, an energy range, a serving label, a nutrient id, or a field of `src/usda/schemas.ts`). Copy the whole output into the chat with the engineer; fixing golden entries is editing `fixtures/golden-list.json` and re-running the same command (no new download).

### 6.4 Release check (before beta, after each USDA release, against the FULL real data)
Read-only; works on the local or the remote database.
```bash
pnpm food:release-check --checks golden,size                                   # local
pnpm food:release-check --checks golden,size --target remote --confirm-remote <project-ref>
```
| Check | What it proves | Pass means |
|---|---|---|
| `golden` | AC 48 and 49: every entry of `fixtures/golden-list.json` exists, is visible and `verified`, has a plausible energy and its named serving. | no `FAIL` lines. `WARN (optional)` lines are Italian staples USDA does not cover: move them to the barcode list (spec 4b). |
| `size` | AC 6: food data and database size against the 300 MB budget (fails above +10 percent) and the 450 MB ceiling, visible rows per dataset and tier. | `PASS`; note `free for user data` in the import report. |
| `italian-barcodes` | AC 4b: at least 90 percent of about 30 real Italian barcodes resolve. | Not built yet: arrives with spec 002b (OFF). |

Exit code 0 is PASS, 1 is FAIL. After the first full real run, recalibrate `config/budget.json` from `actual/estimated` in the report (spec T2.1) and tune the Atwater thresholds in `config/rules.json` from the flagged and rejected counts (spec Q7).

### 6.5 Secrets
`FOOD_IMPORT_DATABASE_URL` holds a password: keep it in `tools/food-import/.env` only (gitignored), never in `apps/mobile`, never in an `EXPO_PUBLIC_*` variable, never in CI. CI runs a gitleaks scan on every PR (job `app`, config `.gitleaks.toml`).

