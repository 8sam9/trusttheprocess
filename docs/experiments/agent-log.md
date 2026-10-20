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

## Feature-level summary
| Feature | Total time | Total tokens | Rework loops | Escaped bugs (30d) | Human time | Verdict |
|---|---|---|---|---|---|---|
