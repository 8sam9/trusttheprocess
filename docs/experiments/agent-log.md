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
| 2026-10-20 | 001 onboarding & targets | backend-engineer → review fixes (M2, L2–L5, tz) | sonnet | 3m28s | ~48k | 1 | 0 | 155 pgTAP ok, 66 fixture cases; flagged L3 west-travel side effect |
| 2026-10-20 | 001 onboarding & targets | mobile-engineer → review fixes (R1, R2, L1, L6, 8 nits) | sonnet | 8m54s | ~90k | 1 | 0 | 0 lint warnings; R1 verified at 390×844 + 375×667 |
| 2026-10-20 | 001a | product-manager | Opus 5.5 (claude.ai, inline — not subagent) | ~5 min | ~25k | 0 | 0 | Spec drafted; 6 open questions |
| 2026-10-20 | 001a | 🧑 Gate 1 | — | ~4 min | — | 0 | 1 | Approved with all PM recommendations; moved to backlog (before closed beta) |
| 2026-10-20 | 002 food DB import | product-manager → spec (Product section) | sonnet | 5m52s | ~148k | 0 | 0 (awaiting gate 1) | 54 ACs, 15 open questions with defaults; verified USDA/OFF/Supabase facts on official pages; found USDA licence is "public domain" not CC0 as PRODUCT_SPEC says; suggests 002a/002b split |
| 2026-10-20 | 002 food DB import | orchestrator → CR-1 Italian products (human asked before Gate 1) | opus | ~4m | ~20k | 1 | 1 (change request) | Italy added as market with Italian names accepted; new AC 4a (fixture) + 4b (30 real Italian barcodes, ≥90% resolve); Q3/Q13 marked decided |
| 2026-10-20 | 002 food DB import | orchestrator → CR-2 size budget (human, during Gate 1 discussion) | opus | ~1h (mostly discussion) | ~30k | 1 | 1 (decision: no paid plan before beta) | Q1 decided: Free plan, 300 MB for US + Italy; new AC 6a (budget enforced, US branded dropped first) + 6b (single food-read module so a 2nd free project stays a fallback) |
| 2026-10-20 | 002 food DB import | 🧑 Gate 1 | — | ~1h35m (12:28–14:03, incl. voice) | — | 0 | 15 decisions | Approved: 11 defaults accepted as written, 2 CRs (Italy; Free plan 300 MB US+IT), Q10 changed (attribution page → backlog 011 before beta), Q12 extended (Italian staples). Design stage skipped: no screens left in 002 |
| 2026-10-20 | 002 food DB import | architect → Technical plan T1–T14 + ADR 0006/0007/0008 | opus | ~36m active (+ ~2h paused on usage limit, resumed) | ~215k | 0 | 0 (H1–H6 proceeded on defaults, flagged to human) | split 002a/002b; ~450 B/food measured on synthetic rows → US+IT fits 270 MB target; found OFF CSV prefers prepared values (would break AC 11) and USDA ids change per revision; USDA/OFF hosts unreachable from sandbox → H1 fixture cut on human machine |
| 2026-10-20 | 002a food DB (USDA core) | backend-engineer → C1 shared contract (foods.ts, gtin.ts) | sonnet | 2m58s | ~74k | 0 | 0 | 203 shared tests (66 new); prettier run this time; 7 open questions logged (FoodRow.reasons must hold soft flags only — passed to B1/M1) |
| 2026-10-20 | 002a food DB (USDA core) | mobile-engineer → M1 food-data access module | sonnet | 4m43s | ~71k | 0 | 0 | 304 mobile tests (29 new incl. architecture grep); surfaced 3 RPC contract needs, relayed to the parallel SQL agent mid-run |
| 2026-10-20 | 002a food DB (USDA core) | backend-engineer → B1–B2 schema, RLS, recompute_canonical, read RPCs | sonnet | 7m22s | ~133k | 0 | 0 | 318 pgTAP ok (163 new) on rebuilt PG16 stand-in; matched M1's contract; real Supabase PG17 only in CI |
| 2026-10-20 | 002a food DB (USDA core) | backend-engineer → B3–B5 importer scaffold, rules, USDA readers | sonnet | 17m51s | ~176k | 0 | 0 | 122 tests; 50k-record streaming test flat at ~13 MB heap; all USDA shapes synthetic (H1); one mobile test flake under CPU load |

## Feature-level summary
| Feature | Total time | Total tokens | Rework loops | Escaped bugs (30d) | Human time | Verdict |
|---|---|---|---|---|---|---|
| 001 onboarding & targets | ~2h40m agent wall time (19 Oct 19:40 → 20 Oct ~11:00 incl. human gates) | ~1.3M | 2 (QA loop + review loop) | tbd | 3 gates + 1 change request + mockup review | pending Gate 3 — notes: bugs were found by looking at rendered screens, not by unit tests; parallel backend/mobile on disjoint files worked; reviewers found real issues (consent withdrawal, guarded reset) |
