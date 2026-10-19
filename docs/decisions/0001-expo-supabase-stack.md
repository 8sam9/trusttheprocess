# ADR 0001 — Expo + Supabase stack
Status: Accepted (2026-10-19)

## Context
We need iOS, Android and web from a small (AI-agent-heavy) team, camera access for barcode/photo, and a fast path to the stores.
## Decision
Expo (React Native, TypeScript) for every client, and Supabase for Postgres, auth, storage and edge functions.
## Consequences
+ One language end to end, and agents work well with a single TS codebase.
+ RLS gives per-user isolation at the database level.
− Vendor coupling to Supabase (mitigated: standard Postgres, self-hostable).
− Some native modules (HealthKit) need a dev client / config plugins, not Expo Go.
