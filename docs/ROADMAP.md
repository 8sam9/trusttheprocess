# Roadmap

## Status — 2026-10-20
| Item | Status |
|---|---|
| Milestone 0 — foundations | ✅ done (PRs #1, #2) |
| Design foundations — Track Day v1 | ✅ done (PR #2, canvas + docs/design) |
| **001 onboarding & targets** | ✅ **merged 2026-10-20 (PR #3)** — spec `docs/specs/001-onboarding-targets.md` |
| 001a consent withdrawal & data erasure | ⏳ next — required before beta (see open decisions) |
| 002 food DB import | ⏳ next feature after 001a |

**Open decisions carried over from 001 (human):**
- **M1 / GDPR** — withdrawing health-data consent keeps body stats + `daily_targets`. Recommended: erase on withdraw with confirmation → feature **001a**. Blocks beta.
- **M3 / analytics** — before adding any analytics SDK: separate analytics consent for `goal` / `floor_applied` / `pace_band`; count `onboarding_blocked` anonymously. Blocks adding PostHog.
- **L7** — completed user who edits birth year to under 16: blocked, data stays; offer deletion? (fold into 001a)
- **L3** — after a westward timezone move a same-day target edit may apply from the next local date (cost of "no backdating"). Accepted unless reported.
- **H4** — Maestro flows exist (`apps/mobile/e2e/`) but don't run in CI yet (needs EAS/Maestro Cloud or a local simulator).
- Legal: privacy-policy text + `EXPO_PUBLIC_PRIVACY_URL` before beta; trademark check on "Trust the Process" before marketing.

**Lessons from running the pipeline on 001** (apply to next features):
- All QA bugs were found by looking at rendered screens; unit tests were green. Keep the browser/screenshot check in QA and make the mobile engineer do it too.
- Agents must run `pnpm format:check` (one stage forgot).
- Backend ∥ mobile in parallel works when they own disjoint paths and only the orchestrator edits the spec.
- In cloud sessions Supabase can't run in Docker: use the Postgres stand-in for pgTAP, and open a draft PR early so CI tests against real Supabase.

## Milestone 0 — Foundations (week 1) — ✅ done 2026-10-19, see docs/SETUP.md
- Monorepo scaffold, Expo app runs on iOS/Android/web, Supabase project + local dev (`supabase start`)
- CI: lint, typecheck, unit tests, pgTAP; EAS dev builds
- Auth (magic link, Apple, Google), profile, account deletion
- packages/shared nutrition math (BMR/TDEE/macros) with tests

## Design foundations (parallel with Milestone 0) — ✅ Track Day v1 accepted 2026-10-19, see docs/design/DESIGN_SYSTEM.md + MOCKUPS.md
- Name and visual direction (2–3 directions → pick one)
- Design system v1 → docs/design/DESIGN_SYSTEM.md + packages/ui tokens
- Key flow mockups: onboarding, today's diary, add-food sheet (search/barcode/text), food detail, weight
- Usability check: log a full day in < 60 s on the mockups

## Milestone 1 — MVP / closed beta (weeks 2–5)  → PRODUCT_SPEC §4
~~001 onboarding & targets~~ ✅ · **001a consent withdrawal & erasure (new, from 001 security review)** · 002 food DB import (USDA + OFF) · 003 food search & diary
004 barcode scan · 005 recents/favorites/copy meal · 006 custom food & quick add
007 weight log · 008 natural-language logging (N1) · 009 data-quality badges (N5) · 010 offline sync (N9)
→ TestFlight + Play internal testing, 20–50 beta users

## Milestone 2 — Public launch v1.0 (weeks 6–10)
Water, exercise, Health sync, recipes, macro/per-meal goals, fasting, export, photo + voice logging,
"Fix my day", adaptive TDEE, widgets, Pro subscription (RevenueCat), progress reports.
Go-to-market: landing page, store listings/ASO, privacy policy/ToS, Product Hunt + Reddit launch.

## Milestone 3 — Growth (post-launch)
Meal planner + grocery list, menu scan, GLP-1 mode, wearables, localisation (IT, ES, DE…).
