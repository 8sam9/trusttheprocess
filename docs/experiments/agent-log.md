# Agent field-test log

One row per pipeline stage. "Rework" = times the stage was re-run because a later stage or a human rejected it.
"Escaped bugs" = bugs found after merge that trace back to this feature.

| Date | Feature | Stage / agent | Model | Wall time | Tokens (approx) | Rework | Human interventions | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-10-19 | 001 onboarding & targets | product-manager → spec (Product section) | sonnet | 2m32s | ~50k | 0 | 0 (awaiting gate 1) | 32 ACs, 12 open questions with defaults; worked example verified by orchestrator (1,330 kcal ✓) |
| 2026-10-19 | 001 onboarding & targets | product-designer → Design section | opus | 7m27s | ~91k | 0 | 0 (awaiting gate 2) | 11 screens/states, 12-tap happy path; found 2 spec bugs (AC19 rounding, AC20 floor≥maintenance) + 9 open items |
| 2026-10-20 | 001 onboarding & targets | orchestrator → 12 mockups on canvas (human asked) + CR-1 custom pace | opus | ~25m | — | 1 (human change request on pace) | Gate 2 approved after 1 change | mockups surfaced a product change the text spec hadn't |
| 2026-10-20 | 001 onboarding & targets | architect → Technical plan T1–T9 + ADR 0004/0005 | opus | 10m59s | ~161k | 0 | 0 (H1–H5 proceeded on defaults, flagged to human) | found existing gap: settings could write body stats without consent; RPC-only writes close it |
| 2026-10-20 | 001 onboarding & targets | backend-engineer → C1 shared contract | sonnet | 6m10s | ~123k | 0 | 0 | 120 shared tests; forgot prettier (orchestrator fixed — add format to agent DoD) |
| 2026-10-20 | 001 onboarding & targets | backend-engineer → B1–B5 (migration, apply_targets, reset RPC, generated pgTAP, CI check) | sonnet | 3m19s | ~96k | 0 | 0 | 131 pgTAP ok on stand-in; green on real Supabase in CI first try (PR #3 draft) |
| 2026-10-20 | 001 onboarding & targets | mobile-engineer → M1–M10 (8 routes, 11 ui components, sheet, settings, analytics, Maestro YAMLs) | sonnet | 36m11s | ~62k (+ tool output) | 0 | 0 | 255 mobile tests; skipped optional visual check; Maestro unrun (no simulator) |
| 2026-10-20 | 001 onboarding & targets | qa-engineer → full AC map + browser exploratory run | sonnet | 15m09s | ~171k | — | 0 | QA: FAIL (2 major, 5 minor) — all found only by looking at rendered screens; unit tests were green. Orchestrator spotted 1 more (double header). QA wrongly said no Maestro flows exist |
| 2026-10-20 | 001 onboarding & targets | mobile-engineer → QA fix loop 1 (8 bugs + 1 nit) | sonnet | 12m09s | ~151k | 1 | 0 | all fixed with tests; 1 fix (blank-screen route) only provable in browser, its jest test also passes without the fix |
| 2026-10-20 | 001 onboarding & targets | qa-engineer → re-run 1 | sonnet | 7m47s | ~74k | — | 0 | QA: PASS; all 8 fixes confirmed; 2 new minor (R1 hidden disclaimer/warning — orchestrator upgraded to must-fix, R2 wrong Maestro assertion) |
| 2026-10-20 | 001 onboarding & targets | code-reviewer | sonnet | 1m23s | ~58k | — | 0 | REVIEW: APPROVE, 8 nits |
| 2026-10-20 | 001 onboarding & targets | security-privacy-reviewer | opus | 22m04s | ~67k | — | 0 | SECURITY: APPROVE; 3 medium (2 need human decisions), 8 low; ran live adversarial SQL probes |

## Feature-level summary
| Feature | Total time | Total tokens | Rework loops | Escaped bugs (30d) | Human time | Verdict |
|---|---|---|---|---|---|---|
