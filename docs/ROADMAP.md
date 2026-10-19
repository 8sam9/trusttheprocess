# Roadmap

## Milestone 0 — Foundations (week 1) — scaffolded 2026-10-19, see docs/SETUP.md
- Monorepo scaffold, Expo app runs on iOS/Android/web, Supabase project + local dev (`supabase start`)
- CI: lint, typecheck, unit tests, pgTAP; EAS dev builds
- Auth (magic link, Apple, Google), profile, account deletion
- packages/shared nutrition math (BMR/TDEE/macros) with tests

## Design foundations (parallel with Milestone 0)
- Name and visual direction (2–3 directions → pick one)
- Design system v1 → docs/design/DESIGN_SYSTEM.md + packages/ui tokens
- Key flow mockups: onboarding, today's diary, add-food sheet (search/barcode/text), food detail, weight
- Usability check: log a full day in < 60 s on the mockups

## Milestone 1 — MVP / closed beta (weeks 2–5)  → PRODUCT_SPEC §4
001 onboarding & targets · 002 food DB import (USDA + OFF) · 003 food search & diary
004 barcode scan · 005 recents/favorites/copy meal · 006 custom food & quick add
007 weight log · 008 natural-language logging (N1) · 009 data-quality badges (N5) · 010 offline sync (N9)
→ TestFlight + Play internal testing, 20–50 beta users

## Milestone 2 — Public launch v1.0 (weeks 6–10)
Water, exercise, Health sync, recipes, macro/per-meal goals, fasting, export, photo + voice logging,
"Fix my day", adaptive TDEE, widgets, Pro subscription (RevenueCat), progress reports.
Go-to-market: landing page, store listings/ASO, privacy policy/ToS, Product Hunt + Reddit launch.

## Milestone 3 — Growth (post-launch)
Meal planner + grocery list, menu scan, GLP-1 mode, wearables, localisation (IT, ES, DE…).
