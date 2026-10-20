# Roadmap

## Milestone 0 — Foundations (week 1) — scaffolded 2026-10-19, see docs/SETUP.md
- Monorepo scaffold, Expo app runs on iOS/Android/web, Supabase project + local dev (`supabase start`)
- CI: lint, typecheck, unit tests, pgTAP; EAS dev builds
- Auth (magic link, Apple, Google), profile, account deletion
- packages/shared nutrition math (BMR/TDEE/macros) with tests

## Design foundations (parallel with Milestone 0) — Track Day v1 accepted 2026-10-19, see docs/design/DESIGN_SYSTEM.md
- Name and visual direction (2–3 directions → pick one)
- Design system v1 → docs/design/DESIGN_SYSTEM.md + packages/ui tokens
- Key flow mockups: onboarding, today's diary, add-food sheet (search/barcode/text), food detail, weight
- Usability check: log a full day in < 60 s on the mockups

## Milestone 1 — MVP / closed beta (weeks 2–5)  → PRODUCT_SPEC §4
001 onboarding & targets · 002 food DB import (USDA + OFF) · 003 food search & diary
004 barcode scan · 005 recents/favorites/copy meal · 006 custom food & quick add
007 weight log · 008 natural-language logging (N1) · 009 data-quality badges (N5) · 010 offline sync (N9)
→ TestFlight + Play internal testing, 20–50 beta users

### Backlog — must ship before the closed beta
| Feature | Spec | Status | When |
|---|---|---|---|
| 001a consent withdrawal & data erasure | [docs/specs/001a-consent-withdrawal-data-erasure.md](specs/001a-consent-withdrawal-data-erasure.md) | Spec approved (Gate 1, 2026-10-20) · not started | Last item before beta. **Beta blocker:** beta users are real people giving health data |
| 011 food data sources (attribution) page | — (moved out of 002, see AC 44) | Not started | Before beta. **Beta blocker:** the Open Food Facts licence requires visible credit; no OFF-derived food may be shown until it ships |

Note for 001 onboarding: until 001a ships, onboarding should still record the `health_data` consent tick with a
policy version, so 001a can re-prompt (AC13) instead of retrofitting consent for existing beta accounts.

## Milestone 2 — Public launch v1.0 (weeks 6–10)
Water, exercise, Health sync, recipes, macro/per-meal goals, fasting, export, photo + voice logging,
"Fix my day", adaptive TDEE, widgets, Pro subscription (RevenueCat), progress reports.
Go-to-market: landing page, store listings/ASO, privacy policy/ToS, Product Hunt + Reddit launch.

## Milestone 3 — Growth (post-launch)
Meal planner + grocery list, menu scan, GLP-1 mode, wearables, localisation (IT, ES, DE…).
