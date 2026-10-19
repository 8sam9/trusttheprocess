# TrustTheProcess — instructions for Claude

Calorie & macro tracker (Expo + Supabase, TypeScript). Global, English-first.
Read before working: docs/PRODUCT_SPEC.md · docs/ARCHITECTURE.md · docs/WORKFLOW.md · docs/design/DESIGN_SYSTEM.md · docs/decisions/

## How we work
- Features go through `/feature` (role-based agents in .claude/agents). There are three human gates: spec, design, and PR merge.
- Small fixes (< ~30 lines, no schema change) may be done directly by the main session, but still need tests.
- Log every agent stage in docs/experiments/agent-log.md; this project is also an experiment in AI-driven development.

## Hard rules
- Clean-room: never reverse engineer, scrape or copy MyFitnessPal or other competitors' code, APIs, assets or data (ADR 0002).
- No secrets in the client. LLM and service-role keys live only in edge functions.
- RLS on every user-owned table, with pgTAP tests.
- Health data is sensitive: no PII in analytics or logs, and keep export + deletion working.
- No medical claims; supportive, non-shaming copy.
- Never run production deploys, store submits, or destructive DB commands without explicit human confirmation.

## Conventions
- UI uses only design-system tokens and components from packages/ui; no ad-hoc colours or spacing.
- pnpm workspaces + Turborepo. Commands: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `supabase test db`.
- TypeScript strict, no `any`; zod schemas in packages/shared are the contract between client and server.
- Metric units and UTC timestamps in storage; diary date = user-local `YYYY-MM-DD`.
- Conventional Commits (`feat:`, `fix:`, `chore:`…), one feature per branch `feat/NNN-slug`.
