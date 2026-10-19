# Agent field-test log

One row per pipeline stage. "Rework" = times the stage was re-run because a later stage or a human rejected it.
"Escaped bugs" = bugs found after merge that trace back to this feature.

| Date | Feature | Stage / agent | Model | Wall time | Tokens (approx) | Rework | Human interventions | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-10-19 | 001 onboarding & targets | product-manager → spec (Product section) | sonnet | 2m32s | ~50k | 0 | 0 (awaiting gate 1) | 32 ACs, 12 open questions with defaults; worked example verified by orchestrator (1,330 kcal ✓) |

## Feature-level summary
| Feature | Total time | Total tokens | Rework loops | Escaped bugs (30d) | Human time | Verdict |
|---|---|---|---|---|---|---|
