# Architecture

## Overview
```
┌──────────────── apps/mobile (Expo, iOS/Android/Web) ────────────────┐
│ Expo Router · TypeScript strict · NativeWind · TanStack Query       │
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
                │ nightly import jobs          └───────────────────────────┘
        ┌───────┴───────────────┐
        │ tools/food-import     │  USDA FDC + Open Food Facts dumps → normalised `foods`
        └───────────────────────┘
```

## Monorepo layout (pnpm workspaces + Turborepo)
```
apps/mobile/            Expo app (also builds the web target)
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
| Client | Expo SDK (latest stable), Expo Router | One codebase, OTA updates via EAS Update |
| Backend | Supabase | Postgres + auth + storage + functions with no servers to run; easy to self-host later |
| AI | Claude API via edge function, tool-use structured output validated by zod | Keys never on device; output is typed |
| Offline | Local SQLite + outbox queue, last-write-wins per entry | Diary must work with no signal |
| Payments | RevenueCat | One entitlement model across App Store / Play / Stripe |
| Observability | Sentry (crash/perf), PostHog EU (product analytics, no PII) | |
| CI/CD | GitHub Actions → EAS Build/Submit; web via `expo export` → Vercel | |

## Core data model (initial)
- `profiles` (user_id, sex, birth_year, height_cm, activity_level, goal, units, locale)
- `targets` (user_id, effective_from, kcal, protein_g, carbs_g, fat_g, per_meal json)
- `foods` (id, source enum[usda|off|user|ai], source_ref, name, brand, barcode, nutrients per 100g jsonb, verified bool)
- `servings` (food_id, label, grams)
- `diary_entries` (id uuid client-generated, user_id, date, meal, food_id nullable, grams, nutrients snapshot jsonb, origin enum[search|barcode|text|photo|voice|quick], ai_confidence, updated_at, deleted_at)
- `weights` (user_id, date, kg) · `water` · `exercises`

Nutrients are **snapshotted** onto diary entries so that later food edits never rewrite history.

## Conventions
- Units: store metric (g, kg, kcal); convert in the UI only.
- Dates: diary uses the user's *local date* string (`YYYY-MM-DD`) + timezone; timestamps UTC.
- IDs: UUIDv7 generated client-side (offline creation).
- All API input/output is validated with zod schemas from `packages/shared`.
