# Architecture

## Overview
```
┌──────────────── apps/mobile (Expo, iOS/Android/Web) ────────────────┐
│ Expo Router · TypeScript strict · @ttp/ui tokens · TanStack Query   │
│ Local SQLite (expo-sqlite + Drizzle) → offline diary + outbox sync  │
│ expo-camera (barcode) · expo-audio (voice) · HealthKit/HealthConnect│
└───────────────┬──────────────────────────────────────┬──────────────┘
                │ supabase-js (RLS-protected)           │ HTTPS
        ┌───────▼────────────────────┐         ┌────────▼──────────────────┐
        │ Supabase Postgres          │         │ Edge Functions (Deno)     │
        │ auth · diary · foods ·     │◄────────┤ ai-parse (text/photo/voice│
        │ pg_trgm + FTS food search  │         │ → Claude API, zod output) │
        │ RLS on every user table    │         │ barcode-lookup (OFF API)  │
        └───────▲────────────────────┘         │ export · delete-account   │
                │ operator-run imports         └───────────────────────────┘
        ┌───────┴───────────────┐
        │ tools/food-import     │  USDA FDC + Open Food Facts dumps → normalised `foods`
        └───────────────────────┘
```

## Monorepo layout (pnpm workspaces + Turborepo)
```
apps/mobile/            Expo app (also builds the web target); routes in apps/mobile/src/app
packages/shared/        zod schemas, types, nutrition math (BMR/TDEE, macros) — pure TS, 100% unit tested
packages/ui/            design tokens + shared components
supabase/migrations/    SQL migrations (source of truth for schema)
supabase/functions/     Edge functions
supabase/tests/         pgTAP tests (RLS!)
tools/food-import/      Data pipelines
docs/                   spec, ADRs, feature specs, experiment log
```

## Key choices (see docs/decisions)
| Concern | Choice | Why |
|---|---|---|
| Client | Expo SDK 58, Expo Router (src/app), React Native 0.88 | One codebase, OTA updates via EAS Update |
| Backend | Supabase | Postgres + auth + storage + functions with no servers to run; easy to self-host later |
| AI | Claude API via edge function, tool-use structured output validated by zod | Keys never on device; output is typed |
| Offline | Local SQLite + outbox queue, last-write-wins per entry | Diary must work with no signal |
| Payments | RevenueCat | One entitlement model across App Store / Play / Stripe |
| Observability | Sentry (crash/perf), PostHog EU (product analytics, no PII) | |
| CI/CD | GitHub Actions → EAS Build/Submit; web via `expo export` → Vercel | |

## Auth (Milestone 0)
- Email **6-digit code** (OTP), not magic links: it works the same on iOS, Android and web, with no deep-link edge cases.
- Sign in with Apple (native, iOS) → `signInWithIdToken`. Google → OAuth (PKCE) in an auth-session browser.
- A `profiles` row is created by a trigger on `auth.users`. Health-data consent is set only through `give_health_data_consent()`.
- Account deletion: `delete-account` edge function → `auth.admin.deleteUser` → everything cascades.

## Core data model (initial)
- `profiles` (user_id, sex, birth_year, height_cm, weight_kg + weight_recorded_on (until 007), activity_level, goal, goal_option, weekly_rate_kg, units, timezone, consent + onboarding timestamps). Body stats are written only through `apply_targets()` (ADR 0004).
- `daily_targets` (user_id, effective_from local date, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, derivation snapshot, formula_version): effective-dated, never recomputed, written only through `apply_targets()` (ADR 0004). Per-meal goals arrive with F12.
- Health-data writes record consent in the same transaction (ADR 0005).
- `food.foods` (schema `food`, not exposed to the Data API; ADR 0006): one row per upstream food from USDA FDC or Open Food Facts. Each row holds:
  - provenance: `source` (`usda|off`), `dataset`, `source_ref`, `release_id`, `last_run_id`;
  - name, `name_lang`, `alt_names`, brand, normalised GTIN-14 `barcode`;
  - the eight canonical nutrients per 100 g as typed columns, with null meaning unknown, plus `carbs_basis`;
  - quality: `tier`, `reasons`, `hidden_reason`;
  - `is_canonical`, and `servings` as an inline jsonb array of `{label, grams}`.

  Clients read it only through `public.get_foods` / `lookup_barcode` / `search_foods` (SECURITY INVOKER) via `apps/mobile/src/lib/foodData.ts`. It is written only by `tools/food-import` as role `food_importer` (ADR 0007), within a 300 MB budget on the Free plan (ADR 0008). Barcode clusters are implicit: rows sharing a barcode, at most one canonical. User-created foods (006) are not in this table.
- `food.import_runs` (run reports; no client access) · `food.releases` (upstream release ids).
- `diary_entries` (id uuid client-generated, user_id, date, meal, food_id nullable, grams, nutrients snapshot jsonb, origin enum[search|barcode|text|photo|voice|quick], ai_confidence, updated_at, deleted_at)
- `weights` (user_id, date, kg) · `water` · `exercises`

Nutrients are **snapshotted** onto diary entries so that later food edits never rewrite history.

## Conventions
- Units: store metric (g, kg, kcal); convert in the UI only.
- Dates: diary uses the user's *local date* string (`YYYY-MM-DD`) + timezone; timestamps UTC.
- IDs: UUIDv7 generated client-side (offline creation).
- All API input/output is validated with zod schemas from `packages/shared`.
